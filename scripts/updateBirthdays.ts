/**
 * Pulse birthday catalog sync (free / unauthenticated sources only).
 *
 * 1) Query Wikidata for K-pop artists (English labels preferred)
 * 2) Download Wikidata P18 → Commons profile images when present
 * 3) Fall back to Wikimedia Commons search (Wikidata depicts / English name)
 * 4) Resize to 256² WebP under data/images/
 * 5) Write data/birthdays.json + missing-image audit report
 *
 * The mobile app must never request Wikimedia directly — only Pulse URLs.
 *
 * Run: npm run update:birthdays
 */

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import type { BirthdayCatalogEntry } from '../src/models/birthday';
import { getPulseDataBaseUrl, hostedImageUrl, imageFilenameFromUrl } from './pulseDataUrl';

const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const WIKIDATA_API_ENDPOINT = 'https://www.wikidata.org/w/api.php';
const COMMONS_API_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';

/** Identifies this sync job to Wikimedia (generation only — never used by the app). */
const SYNC_USER_AGENT =
  'PulseKpopApp/1.0 (birthday-image-sync; contact via repository Issues)';

const KOREAN_IDOL_QID = 'Q521987';
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 3_000;
const REQUEST_TIMEOUT_MS = 120_000;
const COMMONS_BATCH_SIZE = 40;
const IMAGE_SIZE = 256;
const DOWNLOAD_CONCURRENCY = 2;
const DOWNLOAD_GAP_MS = 350;
/** Keep at 1 — Commons aggressively 429s bulk search/imageinfo. */
const COMMONS_SEARCH_CONCURRENCY = 1;
const COMMONS_SEARCH_GAP_MS = 400;

const ROOT = process.cwd();
const OUTPUT_JSON_PATH = path.join(ROOT, 'data', 'birthdays.json');
const AUDIT_JSON_PATH = path.join(ROOT, 'data', 'birthday-image-audit.json');
const IMAGES_DIR = path.join(ROOT, 'data', 'images');
const MANIFEST_PATH = path.join(IMAGES_DIR, 'manifest.json');

type ImageProvider = 'wikidata' | 'commons';

/** Failure taxonomy for artists without a working profile image. */
type MissingImageReasonCode =
  | 'no_wikidata_image'
  | 'wikidata_download_failed'
  | 'not_committed'
  | 'incorrect_url'
  | 'app_cannot_load'
  | 'artist_matching_failed'
  | 'other';

interface WikidataBinding {
  type: string;
  value: string;
}

interface WikidataBindings {
  person: WikidataBinding;
  personLabel?: WikidataBinding;
  fullName?: WikidataBinding;
  birthDate?: WikidataBinding;
  image?: WikidataBinding;
  groupLabel?: WikidataBinding;
}

interface WikidataEntityLabel {
  language?: string;
  value?: string;
}

interface WikidataEntitiesResponse {
  entities?: Record<string, { labels?: Record<string, WikidataEntityLabel> }>;
}

interface WikidataSparqlResponse {
  results?: { bindings?: WikidataBindings[] };
}

interface CommonsImageInfo {
  thumburl?: string;
  url?: string;
}

interface CommonsPage {
  title?: string;
  missing?: boolean | string;
  imageinfo?: CommonsImageInfo[];
}

interface CommonsApiResponse {
  query?: {
    pages?: Record<string, CommonsPage>;
    search?: Array<{ title?: string }>;
  };
}

interface ImageManifestEntry {
  file: string;
  source: string;
  sourceSha256: string;
  provider: ImageProvider;
}

type ImageManifest = Record<string, ImageManifestEntry>;

interface MappedArtist {
  entry: BirthdayCatalogEntry;
  commonsTitle: string | null;
  sourceImageUrl: string | null;
  imageProvider: ImageProvider | null;
  nameTranslatedToEnglish: boolean;
  groupTranslatedToEnglish: boolean;
  /** Set when a Wikidata P18 title existed but Commons URL resolve/download failed. */
  wikidataDownloadFailed: boolean;
  /** Commons search found hits but none passed the strict name match. */
  artistMatchingFailed: boolean;
  /** Commons search returned nothing usable. */
  commonsSearchEmpty: boolean;
  otherError?: string;
}

interface MissingImageAuditEntry {
  id: string;
  name: string;
  group: string;
  wikidataId: string;
  reasonCode: MissingImageReasonCode;
  reason: string;
}

interface SyncReport {
  totalArtistsProcessed: number;
  artistsWithWorkingImages: number;
  imagesFromWikidata: number;
  imagesFromCommons: number;
  artistsWithoutImages: number;
  namesTranslatedToEnglish: number;
  groupNamesTranslatedToEnglish: number;
  missingImages: MissingImageAuditEntry[];
}

function log(message: string): void {
  console.log(`[updateBirthdays] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function containsNonLatinScript(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/.test(text);
}

function cleanLabel(raw?: string | null): string | null {
  const value = raw?.trim().replace(/\s+/g, ' ');
  if (!value || /^Q\d+$/i.test(value)) return null;
  return value;
}

function preferEnglishLabel(
  englishCandidates: Array<string | null | undefined>,
  fallbackCandidates: Array<string | null | undefined>,
): { value: string | null; translatedToEnglish: boolean } {
  const english = englishCandidates.map(cleanLabel).find((v): v is string => Boolean(v));
  const fallbacks = fallbackCandidates.map(cleanLabel).filter((v): v is string => Boolean(v));

  if (english && !containsNonLatinScript(english)) {
    const hadNonEnglish = fallbacks.some((f) => f !== english && containsNonLatinScript(f));
    return { value: english, translatedToEnglish: hadNonEnglish };
  }

  const latinFallback = fallbacks.find((f) => !containsNonLatinScript(f));
  if (latinFallback) {
    const hadNonEnglish = fallbacks.some((f) => f !== latinFallback && containsNonLatinScript(f));
    return { value: latinFallback, translatedToEnglish: hadNonEnglish };
  }

  if (english) return { value: english, translatedToEnglish: false };
  return { value: fallbacks[0] ?? null, translatedToEnglish: false };
}

function buildSparql(): string {
  return `
SELECT ?person ?personLabel ?fullName ?birthDate (SAMPLE(?img) AS ?image) (SAMPLE(?groupName) AS ?groupLabel) WHERE {
  {
    ?person wdt:P106 wd:${KOREAN_IDOL_QID} .
  } UNION {
    ?person wdt:P27 wd:Q884 ;
            wdt:P106 ?occupation ;
            wdt:P463 ?group .
    VALUES ?occupation { wd:Q177220 wd:Q2252262 wd:Q753110 wd:Q639669 wd:Q488205 }
    ?group wdt:P31/wdt:P279* wd:Q215380 .
  }
  ?person wdt:P31 wd:Q5 ;
          wdt:P569 ?birthDate .
  FILTER(NOT EXISTS { ?person wdt:P570 ?_death })
  OPTIONAL { ?person wdt:P1559 ?fullName . FILTER(LANG(?fullName) = "en") }
  OPTIONAL { ?person wdt:P18 ?img . }
  OPTIONAL {
    ?person wdt:P463 ?g2 .
    ?g2 wdt:P31/wdt:P279* wd:Q215380 .
    ?g2 rdfs:label ?groupName .
    FILTER(LANG(?groupName) = "en")
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
GROUP BY ?person ?personLabel ?fullName ?birthDate
ORDER BY ASC(?personLabel)
`.trim();
}

function extractQid(entityUri: string): string {
  const match = entityUri.match(/Q\d+$/);
  return match?.[0] ?? entityUri;
}

function extractCommonsFileTitle(raw?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.replace(/^http:/, 'https:'));
    const marker = '/Special:FilePath/';
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) {
      if (url.pathname.includes('/wiki/File:')) {
        const title = decodeURIComponent(url.pathname.split('/wiki/')[1] ?? '');
        return title.startsWith('File:') ? title : `File:${title}`;
      }
      return null;
    }
    const encodedName = url.pathname.slice(idx + marker.length);
    if (!encodedName) return null;
    const fileName = decodeURIComponent(encodedName);
    return fileName.startsWith('File:') ? fileName : `File:${fileName}`;
  } catch {
    return null;
  }
}

function normalizeBirthday(raw?: string): string | null {
  if (!raw) return null;
  const date = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function artistImageFilename(name: string, artistId: string): string {
  const slug =
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'artist';
  return `${slug}-${artistId.toLowerCase()}.webp`;
}

function normalizeMatch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function mapBinding(binding: WikidataBindings): MappedArtist | null {
  const personUri = binding.person?.value;
  if (!personUri) return null;
  const wikidataId = extractQid(personUri);
  const birthday = normalizeBirthday(binding.birthDate?.value);
  if (!birthday) return null;

  const namePick = preferEnglishLabel(
    [binding.fullName?.value],
    [binding.personLabel?.value],
  );
  if (!namePick.value) return null;

  const groupRaw = cleanLabel(binding.groupLabel?.value) ?? '';

  return {
    commonsTitle: extractCommonsFileTitle(binding.image?.value),
    sourceImageUrl: null,
    imageProvider: null,
    nameTranslatedToEnglish: namePick.translatedToEnglish,
    groupTranslatedToEnglish: false,
    wikidataDownloadFailed: false,
    artistMatchingFailed: false,
    commonsSearchEmpty: false,
    entry: {
      id: wikidataId.toLowerCase(),
      name: namePick.value,
      group: groupRaw,
      birthday,
      image: '',
      wikidataId,
    },
  };
}

async function fetchEnglishLabels(qids: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const unique = [...new Set(qids.map((q) => q.toUpperCase()).filter((q) => /^Q\d+$/.test(q)))];
  const batchSize = 50;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const params = new URLSearchParams({
      action: 'wbgetentities',
      format: 'json',
      props: 'labels',
      languages: 'en',
      languagefallback: '0',
      ids: batch.join('|'),
      origin: '*',
    });

    try {
      const response = await fetch(`${WIKIDATA_API_ENDPOINT}?${params.toString()}`, {
        headers: {
          'User-Agent': SYNC_USER_AGENT,
          'Api-User-Agent': SYNC_USER_AGENT,
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        log(`wbgetentities HTTP ${response.status} for batch starting ${batch[0]}`);
        continue;
      }
      const payload = (await response.json()) as WikidataEntitiesResponse;
      for (const [qid, entity] of Object.entries(payload.entities ?? {})) {
        const en = cleanLabel(entity.labels?.en?.value);
        if (en) labels.set(qid.toUpperCase(), en);
      }
    } catch (error) {
      log(`wbgetentities failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (i + batchSize < unique.length) await sleep(150);
  }

  return labels;
}

async function applyEnglishLabelPass(rows: MappedArtist[]): Promise<void> {
  const needsName = rows.filter(
    (row) => containsNonLatinScript(row.entry.name) || /^Q\d+$/i.test(row.entry.name),
  );

  if (!needsName.length) {
    log('English label pass: all artist names already English/Latin');
    return;
  }

  log(`English label pass: resolving ${needsName.length} non-English artist names…`);
  const labels = await fetchEnglishLabels(needsName.map((row) => row.entry.wikidataId));

  let renamed = 0;
  for (const row of needsName) {
    const en = labels.get(row.entry.wikidataId.toUpperCase());
    if (!en || en === row.entry.name) continue;
    row.entry.name = en;
    row.nameTranslatedToEnglish = true;
    renamed += 1;
  }
  log(`English label pass: translated ${renamed} artist names to English`);
}

async function fetchSparql(query: string): Promise<WikidataSparqlResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      log(`SPARQL request attempt ${attempt}/${MAX_RETRIES}…`);
      const response = await fetch(WIKIDATA_SPARQL_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': SYNC_USER_AGENT,
          'Api-User-Agent': SYNC_USER_AGENT,
        },
        body: `query=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Wikidata HTTP ${response.status}: ${body.slice(0, 200)}`);
      }
      return (await response.json()) as WikidataSparqlResponse;
    } catch (error) {
      lastError = error;
      log(`Attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
      if (attempt < MAX_RETRIES) await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function resolveCommonsSourceUrls(fileTitles: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const unique = [...new Set(fileTitles.filter(Boolean))];
  log(`Resolving ${unique.length} Commons source URLs…`);

  for (let i = 0; i < unique.length; i += COMMONS_BATCH_SIZE) {
    const batch = unique.slice(i, i + COMMONS_BATCH_SIZE);
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: String(IMAGE_SIZE),
      titles: batch.join('|'),
      origin: '*',
    });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(`${COMMONS_API_ENDPOINT}?${params.toString()}`, {
          headers: {
            'User-Agent': SYNC_USER_AGENT,
            'Api-User-Agent': SYNC_USER_AGENT,
            Accept: 'application/json',
          },
        });
        if (response.status === 429 || response.status === 503) {
          const retryAfter = Number(response.headers.get('retry-after'));
          const waitMs =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : 5_000 * attempt;
          log(`Commons rate limited (${response.status}) — waiting ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }
        if (!response.ok) throw new Error(`Commons API HTTP ${response.status}`);
        const payload = (await response.json()) as CommonsApiResponse;
        for (const page of Object.values(payload.query?.pages ?? {})) {
          if (!page.title || page.missing !== undefined) continue;
          const direct = page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url;
          if (!direct || direct.includes('Special:FilePath')) continue;
          resolved.set(page.title, direct.replace(/^http:/, 'https:'));
        }
        break;
      } catch (error) {
        log(
          `Commons batch failed (attempt ${attempt}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        if (attempt < 3) await sleep(3_000 * attempt);
      }
    }
    if (i + COMMONS_BATCH_SIZE < unique.length) await sleep(500);
  }

  log(`Resolved ${resolved.size}/${unique.length} source download URLs`);
  return resolved;
}

/** True only when the Commons file title clearly refers to this artist. */
function commonsTitleMatchesArtist(title: string, artistName: string, groupName: string): boolean {
  const file = title.replace(/^File:/i, '');
  const normalizedFile = normalizeMatch(file);
  const artist = normalizeMatch(artistName);
  if (!artist || artist.length < 2) return false;
  if (!normalizedFile.includes(artist)) return false;

  // Reject obvious group-only shots when the artist name is a tiny substring of a longer token.
  if (groupName) {
    const group = normalizeMatch(groupName);
    if (group && normalizedFile.includes(group) && !normalizedFile.includes(artist)) {
      return false;
    }
  }
  return true;
}

/**
 * Free Commons fallback — prefer structured "depicts" links to the Wikidata
 * entity so we never assign the wrong artist's photo. Optional English-name
 * search is a last resort with a strict title match.
 */
async function searchCommonsFileTitles(
  wikidataId: string,
  artistName: string,
  groupName: string,
): Promise<{
  titles: string[];
  matchingFailed: boolean;
  empty: boolean;
  rateLimited: boolean;
}> {
  const qid = wikidataId.toUpperCase();
  // Structured depicts first (safe). English name only if depicts is empty.
  const queries = [`haswbstatement:P180=${qid}`, `"${artistName}"`];

  const titles: string[] = [];
  let sawHits = false;
  let sawRejected = false;
  let rateLimited = false;

  for (const query of queries) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      list: 'search',
      srsearch: query,
      srnamespace: '6',
      srlimit: '5',
      origin: '*',
    });

    let attempt = 0;
    let gotResponse = false;
    while (attempt < 3 && !gotResponse) {
      attempt += 1;
      try {
        const response = await fetch(`${COMMONS_API_ENDPOINT}?${params.toString()}`, {
          headers: {
            'User-Agent': SYNC_USER_AGENT,
            'Api-User-Agent': SYNC_USER_AGENT,
            Accept: 'application/json',
          },
        });
        if (response.status === 429 || response.status === 503) {
          rateLimited = true;
          const retryAfter = Number(response.headers.get('retry-after'));
          const waitMs =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, 20_000)
              : 5_000 * attempt;
          log(`Commons search rate limited (${response.status}) — waiting ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }
        gotResponse = true;
        if (!response.ok) break;

        const payload = (await response.json()) as CommonsApiResponse;
        const hits = payload.query?.search ?? [];
        if (hits.length) sawHits = true;

        const isStructured = query.startsWith('haswbstatement:');
        for (const hit of hits) {
          const title = hit.title;
          if (!title) continue;
          if (!isStructured && !commonsTitleMatchesArtist(title, artistName, groupName)) {
            sawRejected = true;
            continue;
          }
          titles.push(title.startsWith('File:') ? title : `File:${title}`);
        }
      } catch {
        gotResponse = true;
      }
    }

    if (titles.length) break;
    await sleep(COMMONS_SEARCH_GAP_MS);
  }

  const unique = [...new Set(titles)];
  return {
    titles: unique.slice(0, 1),
    matchingFailed: !unique.length && sawHits && sawRejected,
    empty: !unique.length && !sawHits,
    rateLimited,
  };
}

async function loadManifest(): Promise<ImageManifest> {
  try {
    const raw = await readFile(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, Partial<ImageManifestEntry> & { provider?: string }>;
    const normalized: ImageManifest = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (!entry?.file || !entry.source || !entry.sourceSha256) continue;
      // Drop legacy Spotify-sourced entries from the provider taxonomy; keep files if present via hydrate.
      const provider: ImageProvider = entry.provider === 'commons' ? 'commons' : 'wikidata';
      normalized[id] = {
        file: entry.file,
        source: entry.source,
        sourceSha256: entry.sourceSha256,
        provider,
      };
    }
    return normalized;
  } catch {
    return {};
  }
}

async function saveManifest(manifest: ImageManifest): Promise<void> {
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadSourceBytes(url: string): Promise<Buffer> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': SYNC_USER_AGENT,
          'Api-User-Agent': SYNC_USER_AGENT,
          Accept: 'image/*,*/*',
        },
      });

      if (response.status === 429 || response.status === 503) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 2_000 * 2 ** (attempt - 1);
        log(`Rate limited (${response.status}) — waiting ${waitMs}ms before retry ${attempt}/5`);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Image download HTTP ${response.status} for ${url}`);
      }

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 5) await sleep(1_000 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function writePulseWebp(sourceBytes: Buffer, destPath: string): Promise<void> {
  await sharp(sourceBytes)
    .rotate()
    .resize(IMAGE_SIZE, IMAGE_SIZE, {
      fit: 'cover',
      position: 'attention',
    })
    .webp({ quality: 82 })
    .toFile(destPath);
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

function dedupeMapped(rows: MappedArtist[]): MappedArtist[] {
  const byId = new Map<string, MappedArtist>();
  for (const row of rows) {
    const existing = byId.get(row.entry.wikidataId);
    if (!existing) {
      byId.set(row.entry.wikidataId, row);
      continue;
    }
    const score = (r: MappedArtist) =>
      (r.entry.group ? 2 : 0) +
      (r.entry.image || r.sourceImageUrl || r.commonsTitle ? 1 : 0) +
      (r.nameTranslatedToEnglish ? 0.25 : 0) +
      r.entry.name.length / 100;
    if (score(row) > score(existing)) byId.set(row.entry.wikidataId, row);
  }
  return [...byId.values()].sort((a, b) =>
    a.entry.name.localeCompare(b.entry.name, 'en', { sensitivity: 'base' }),
  );
}

function assertPulseOnlyImages(entries: BirthdayCatalogEntry[], dataBaseUrl: string): void {
  const imagePrefix = `${dataBaseUrl}/images/`;
  const bad = entries.filter(
    (e) =>
      e.image &&
      (e.image.includes('wikimedia.org') ||
        e.image.includes('Special:FilePath') ||
        e.image.includes('scdn.co') ||
        e.image.includes('spotify') ||
        !e.image.startsWith(imagePrefix)),
  );
  if (bad.length) {
    throw new Error(
      `Refusing to write non-Pulse image URLs (e.g. ${bad[0]?.name}: ${bad[0]?.image})`,
    );
  }
}

async function materializeImage(
  row: MappedArtist,
  sourceUrl: string,
  provider: ImageProvider,
  manifest: ImageManifest,
  dataBaseUrl: string,
): Promise<'downloaded' | 'skipped' | 'failed'> {
  const artistId = row.entry.id;
  const filename = artistImageFilename(row.entry.name, artistId);
  const destPath = path.join(IMAGES_DIR, filename);
  const previous = manifest[artistId];

  // Never overwrite a valid Wikidata image with a Commons search result.
  if (
    provider === 'commons' &&
    previous?.provider === 'wikidata' &&
    (await fileExists(path.join(IMAGES_DIR, previous.file)))
  ) {
    row.entry.image = hostedImageUrl(previous.file, dataBaseUrl);
    row.imageProvider = 'wikidata';
    return 'skipped';
  }

  try {
    if (
      previous &&
      previous.source === sourceUrl &&
      previous.file === filename &&
      previous.provider === provider &&
      (await fileExists(path.join(IMAGES_DIR, previous.file)))
    ) {
      row.entry.image = hostedImageUrl(previous.file, dataBaseUrl);
      row.imageProvider = provider;
      return 'skipped';
    }

    const bytes = await downloadSourceBytes(sourceUrl);
    const sourceSha256 = createHash('sha256').update(bytes).digest('hex');

    if (
      previous &&
      previous.sourceSha256 === sourceSha256 &&
      previous.file === filename &&
      (await fileExists(path.join(IMAGES_DIR, previous.file)))
    ) {
      manifest[artistId] = {
        file: previous.file,
        source: sourceUrl,
        sourceSha256,
        provider,
      };
      row.entry.image = hostedImageUrl(previous.file, dataBaseUrl);
      row.imageProvider = provider;
      return 'skipped';
    }

    await writePulseWebp(bytes, destPath);
    manifest[artistId] = { file: filename, source: sourceUrl, sourceSha256, provider };
    row.entry.image = hostedImageUrl(filename, dataBaseUrl);
    row.imageProvider = provider;
    return 'downloaded';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Image failed (${provider}) for ${row.entry.name} (${artistId}): ${message}`);
    row.otherError = message;
    return 'failed';
  }
}

function reasonLabel(code: MissingImageReasonCode): string {
  switch (code) {
    case 'no_wikidata_image':
      return 'No Wikidata profile image (P18), and no reliable Commons fallback image was stored.';
    case 'wikidata_download_failed':
      return 'Image exists on Wikidata but failed during download.';
    case 'not_committed':
      return 'Image downloaded locally but is not available at the hosted URL (not committed/published).';
    case 'incorrect_url':
      return 'Image URL is incorrect or local file is missing for the referenced path.';
    case 'app_cannot_load':
      return 'Image exists but cannot be loaded by the app (HTTP error / wrong content type).';
    case 'artist_matching_failed':
      return 'Artist matching failed — Commons candidates were rejected to avoid wrong-artist images.';
    case 'other':
      return 'Other.';
  }
}

async function classifyMissing(
  row: MappedArtist,
  dataBaseUrl: string,
): Promise<MissingImageAuditEntry> {
  const base = {
    id: row.entry.id,
    name: row.entry.name,
    group: row.entry.group,
    wikidataId: row.entry.wikidataId,
  };

  if (row.entry.image) {
    const filename = imageFilenameFromUrl(row.entry.image);
    const localPath = filename ? path.join(IMAGES_DIR, filename) : null;
    const localOk = localPath ? await fileExists(localPath) : false;

    if (!row.entry.image.startsWith(`${dataBaseUrl}/images/`)) {
      return {
        ...base,
        reasonCode: 'incorrect_url',
        reason: `${reasonLabel('incorrect_url')} URL=${row.entry.image}`,
      };
    }

    if (!localOk) {
      return {
        ...base,
        reasonCode: 'incorrect_url',
        reason: `${reasonLabel('incorrect_url')} Missing local file for ${row.entry.image}`,
      };
    }

    // Probe hosted URL — if local exists but remote 404, treat as not committed.
    try {
      const response = await fetch(row.entry.image, {
        method: 'GET',
        headers: { Accept: 'image/webp,image/*,*/*' },
        redirect: 'follow',
      });
      const type = (response.headers.get('content-type') ?? '').toLowerCase();
      if (!response.ok) {
        if (response.status === 404) {
          return {
            ...base,
            reasonCode: 'not_committed',
            reason: `${reasonLabel('not_committed')} HTTP ${response.status} for ${row.entry.image}`,
          };
        }
        return {
          ...base,
          reasonCode: 'app_cannot_load',
          reason: `${reasonLabel('app_cannot_load')} HTTP ${response.status} for ${row.entry.image}`,
        };
      }
      if (!type.includes('image/webp') && !type.includes('image/')) {
        return {
          ...base,
          reasonCode: 'app_cannot_load',
          reason: `${reasonLabel('app_cannot_load')} Content-Type=${type || '(empty)'} for ${row.entry.image}`,
        };
      }
    } catch (error) {
      return {
        ...base,
        reasonCode: 'app_cannot_load',
        reason: `${reasonLabel('app_cannot_load')} ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  if (row.wikidataDownloadFailed || (row.commonsTitle && !row.entry.image)) {
    return {
      ...base,
      reasonCode: 'wikidata_download_failed',
      reason: `${reasonLabel('wikidata_download_failed')}${
        row.otherError ? ` (${row.otherError})` : ''
      }`,
    };
  }

  if (row.artistMatchingFailed) {
    return {
      ...base,
      reasonCode: 'artist_matching_failed',
      reason: reasonLabel('artist_matching_failed'),
    };
  }

  if (row.otherError) {
    return {
      ...base,
      reasonCode: 'other',
      reason: `${reasonLabel('other')} ${row.otherError}`,
    };
  }

  return {
    ...base,
    reasonCode: 'no_wikidata_image',
    reason: reasonLabel('no_wikidata_image'),
  };
}

async function buildAudit(
  mapped: MappedArtist[],
  dataBaseUrl: string,
): Promise<SyncReport> {
  const withImages = mapped.filter((r) => r.entry.image);
  const without = mapped.filter((r) => !r.entry.image);

  // Also flag artists whose URL looks set but is broken.
  const broken: MissingImageAuditEntry[] = [];
  for (const row of withImages) {
    const filename = imageFilenameFromUrl(row.entry.image);
    if (!filename || !(await fileExists(path.join(IMAGES_DIR, filename)))) {
      broken.push(await classifyMissing(row, dataBaseUrl));
      row.entry.image = '';
      row.imageProvider = null;
    }
  }

  const missingRows = mapped.filter((r) => !r.entry.image);
  const missingImages: MissingImageAuditEntry[] = [];
  for (const row of missingRows) {
    missingImages.push(await classifyMissing(row, dataBaseUrl));
  }

  // De-dupe by id (broken list may overlap).
  const byId = new Map<string, MissingImageAuditEntry>();
  for (const entry of [...broken, ...missingImages]) {
    byId.set(entry.id, entry);
  }

  return {
    totalArtistsProcessed: mapped.length,
    artistsWithWorkingImages: mapped.filter((r) => r.entry.image).length,
    imagesFromWikidata: mapped.filter((r) => r.imageProvider === 'wikidata' && r.entry.image)
      .length,
    imagesFromCommons: mapped.filter((r) => r.imageProvider === 'commons' && r.entry.image)
      .length,
    artistsWithoutImages: byId.size,
    namesTranslatedToEnglish: mapped.filter((r) => r.nameTranslatedToEnglish).length,
    groupNamesTranslatedToEnglish: mapped.filter((r) => r.groupTranslatedToEnglish).length,
    missingImages: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'en')),
  };
}

function printReport(report: SyncReport): void {
  const lines = [
    '',
    '========== Birthday sync report ==========',
    `Total artists processed:              ${report.totalArtistsProcessed}`,
    `Artists with working images:          ${report.artistsWithWorkingImages}`,
    `Images retrieved from Wikidata:       ${report.imagesFromWikidata}`,
    `Images retrieved from Wikimedia Commons: ${report.imagesFromCommons}`,
    `Artists without images:               ${report.artistsWithoutImages}`,
    `Artist names translated to English:   ${report.namesTranslatedToEnglish}`,
    `Group names translated to English:    ${report.groupNamesTranslatedToEnglish}`,
    '------------------------------------------',
    'Missing image audit (complete list):',
  ];

  if (!report.missingImages.length) {
    lines.push('  (none)');
  } else {
    const byReason = new Map<string, number>();
    for (const entry of report.missingImages) {
      byReason.set(entry.reasonCode, (byReason.get(entry.reasonCode) ?? 0) + 1);
      lines.push(`  - ${entry.name} (${entry.wikidataId}): [${entry.reasonCode}] ${entry.reason}`);
    }
    lines.push('------------------------------------------');
    lines.push('Missing by reason code:');
    for (const [code, count] of [...byReason.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`  ${code}: ${count}`);
    }
  }

  lines.push('==========================================', '');
  for (const line of lines) console.log(line);
}

async function main(): Promise<void> {
  log('Starting Pulse-owned birthday image sync (Wikidata + Commons only)…');
  const dataBaseUrl = getPulseDataBaseUrl();
  log(`Pulse data base URL: ${dataBaseUrl}`);

  await mkdir(IMAGES_DIR, { recursive: true });
  const manifest = await loadManifest();

  const payload = await fetchSparql(buildSparql());
  const bindings = payload.results?.bindings ?? [];
  log(`Received ${bindings.length} SPARQL bindings`);

  const mappedRaw: MappedArtist[] = [];
  for (const binding of bindings) {
    const row = mapBinding(binding);
    if (row) mappedRaw.push(row);
  }

  await applyEnglishLabelPass(mappedRaw);

  const mapped = dedupeMapped(mappedRaw);
  log(`Mapped ${mapped.length} unique living artists`);

  // Cache-first: reuse local Pulse WebPs so Commons rate limits don't wipe coverage.
  const { readdir } = await import('node:fs/promises');
  const imageFiles = new Set(
    (await readdir(IMAGES_DIR).catch(() => [] as string[])).filter((f) => f.endsWith('.webp')),
  );

  let hydratedFromCache = 0;
  for (const row of mapped) {
    const previous = manifest[row.entry.id];
    if (previous && (await fileExists(path.join(IMAGES_DIR, previous.file)))) {
      row.entry.image = hostedImageUrl(previous.file, dataBaseUrl);
      row.imageProvider = previous.provider;
      hydratedFromCache += 1;
      continue;
    }

    // Recover orphan WebPs from an interrupted prior run (manifest not saved yet).
    const orphan = [...imageFiles].find((f) =>
      f.toLowerCase().endsWith(`-${row.entry.id.toLowerCase()}.webp`),
    );
    if (orphan) {
      row.entry.image = hostedImageUrl(orphan, dataBaseUrl);
      row.imageProvider = 'wikidata';
      manifest[row.entry.id] = {
        file: orphan,
        source: `local-orphan://${orphan}`,
        sourceSha256: 'orphan',
        provider: 'wikidata',
      };
      hydratedFromCache += 1;
    }
  }
  log(`Hydrated ${hydratedFromCache} artists from local image cache`);

  const needWikidata = mapped.filter((row) => !row.entry.image && row.commonsTitle);
  const titles = needWikidata
    .map((row) => row.commonsTitle)
    .filter((title): title is string => Boolean(title));
  const sourceByTitle = titles.length
    ? await resolveCommonsSourceUrls(titles)
    : new Map<string, string>();

  for (const row of needWikidata) {
    row.sourceImageUrl = row.commonsTitle ? sourceByTitle.get(row.commonsTitle) ?? null : null;
    if (row.commonsTitle && !row.sourceImageUrl) {
      row.wikidataDownloadFailed = true;
    }
  }

  let wikidataDownloaded = 0;
  let wikidataSkipped = 0;
  let wikidataFailed = 0;

  const withWikidataSource = needWikidata.filter((row) => row.sourceImageUrl);
  log(`Downloading ${withWikidataSource.length} missing Wikidata (P18) images…`);

  await mapPool(withWikidataSource, DOWNLOAD_CONCURRENCY, async (row) => {
    const result = await materializeImage(
      row,
      row.sourceImageUrl!,
      'wikidata',
      manifest,
      dataBaseUrl,
    );
    if (result === 'downloaded') wikidataDownloaded += 1;
    else if (result === 'skipped') wikidataSkipped += 1;
    else {
      wikidataFailed += 1;
      row.wikidataDownloadFailed = true;
    }
    if (result !== 'skipped') await sleep(DOWNLOAD_GAP_MS);
  });

  const skipCommons =
    process.env.PULSE_SKIP_COMMONS_SEARCH === '1' ||
    process.env.PULSE_SKIP_COMMONS_SEARCH === 'true';
  const needsCommons = mapped.filter((row) => !row.entry.image);
  let commonsDownloaded = 0;
  let commonsSkipped = 0;
  let commonsFailed = 0;
  let consecutiveSearch429 = 0;

  if (skipCommons) {
    log(
      `Skipping Commons search for ${needsCommons.length} artists (PULSE_SKIP_COMMONS_SEARCH set)`,
    );
  } else if (needsCommons.length) {
    log(`Searching Wikimedia Commons for ${needsCommons.length} artists without Wikidata images…`);
    for (const row of needsCommons) {
      if (consecutiveSearch429 >= 8) {
        row.otherError =
          'Wikimedia Commons search skipped after repeated HTTP 429 rate limits';
        commonsFailed += 1;
        continue;
      }

      try {
        const search = await searchCommonsFileTitles(
          row.entry.wikidataId,
          row.entry.name,
          row.entry.group,
        );
        consecutiveSearch429 = search.rateLimited ? consecutiveSearch429 + 1 : 0;
        row.artistMatchingFailed = search.matchingFailed;
        row.commonsSearchEmpty = search.empty;

        if (!search.titles.length) {
          commonsFailed += 1;
          await sleep(COMMONS_SEARCH_GAP_MS);
          continue;
        }

        const title = search.titles[0]!;
        const urls = await resolveCommonsSourceUrls([title]);
        const url = urls.get(title);
        if (!url) {
          commonsFailed += 1;
          row.otherError = `Commons title unresolved: ${title}`;
          await sleep(COMMONS_SEARCH_GAP_MS);
          continue;
        }

        const result = await materializeImage(row, url, 'commons', manifest, dataBaseUrl);
        if (result === 'downloaded') commonsDownloaded += 1;
        else if (result === 'skipped' && row.entry.image) commonsSkipped += 1;
        else {
          commonsFailed += 1;
          if (!row.otherError) {
            row.otherError = 'Commons search title resolved but download failed';
          }
        }

        if ((commonsDownloaded + commonsSkipped) % 10 === 0) {
          await saveManifest(manifest);
        }
      } catch (error) {
        commonsFailed += 1;
        row.otherError = error instanceof Error ? error.message : String(error);
      }
      await sleep(COMMONS_SEARCH_GAP_MS);
    }

    if (consecutiveSearch429 >= 8) {
      log(
        'Commons search circuit breaker open — remaining artists audited without Commons fallback',
      );
    }
  }

  const catalog = mapped
    .map((row) => row.entry)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  assertPulseOnlyImages(catalog, dataBaseUrl);

  await saveManifest(manifest);
  await mkdir(path.dirname(OUTPUT_JSON_PATH), { recursive: true });
  await writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  const report = await buildAudit(mapped, dataBaseUrl);

  // If audit cleared broken URLs, rewrite catalog once more.
  const finalCatalog = mapped
    .map((row) => row.entry)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  assertPulseOnlyImages(finalCatalog, dataBaseUrl);
  await writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(finalCatalog, null, 2)}\n`, 'utf8');

  await writeFile(
    AUDIT_JSON_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dataBaseUrl,
        summary: {
          totalArtistsProcessed: report.totalArtistsProcessed,
          artistsWithWorkingImages: report.artistsWithWorkingImages,
          imagesFromWikidata: report.imagesFromWikidata,
          imagesFromCommons: report.imagesFromCommons,
          artistsWithoutImages: report.artistsWithoutImages,
          namesTranslatedToEnglish: report.namesTranslatedToEnglish,
          groupNamesTranslatedToEnglish: report.groupNamesTranslatedToEnglish,
        },
        missingImages: report.missingImages,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  log(
    `Write complete. wikidataDownloaded=${wikidataDownloaded} wikidataSkipped=${wikidataSkipped} wikidataFailed=${wikidataFailed} commonsDownloaded=${commonsDownloaded} commonsSkipped=${commonsSkipped} commonsFailed=${commonsFailed}`,
  );
  log(`Wrote ${OUTPUT_JSON_PATH}`);
  log(`Wrote ${AUDIT_JSON_PATH}`);
  printReport(report);
}

main().catch((error) => {
  console.error('[updateBirthdays] Fatal:', error);
  process.exitCode = 1;
});
