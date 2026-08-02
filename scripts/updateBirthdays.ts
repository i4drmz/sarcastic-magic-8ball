/**
 * Pulse birthday catalog sync.
 *
 * 1) Query Wikidata for K-pop artists
 * 2) Resolve Commons file metadata to a temporary download URL
 * 3) Download / resize (256²) / WebP each image into data/images/
 * 4) Write data/birthdays.json with Pulse-hosted image URLs only
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
import { getPulseDataBaseUrl, hostedImageUrl } from './pulseDataUrl';

const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
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
/** Keep low — Wikimedia rate-limits aggressive bulk downloads. */
const DOWNLOAD_CONCURRENCY = 2;
const DOWNLOAD_GAP_MS = 350;

const ROOT = process.cwd();
const OUTPUT_JSON_PATH = path.join(ROOT, 'data', 'birthdays.json');
const IMAGES_DIR = path.join(ROOT, 'data', 'images');
const MANIFEST_PATH = path.join(IMAGES_DIR, 'manifest.json');

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
  query?: { pages?: Record<string, CommonsPage> };
}

interface ImageManifestEntry {
  file: string;
  source: string;
  sourceSha256: string;
}

type ImageManifest = Record<string, ImageManifestEntry>;

interface MappedArtist {
  entry: BirthdayCatalogEntry;
  commonsTitle: string | null;
  /** Temporary Wikimedia download URL — never written into birthdays.json. */
  sourceImageUrl: string | null;
}

function log(message: string): void {
  console.log(`[updateBirthdays] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  OPTIONAL { ?person wdt:P1559 ?fullName . FILTER(LANG(?fullName) = "en" || LANG(?fullName) = "ko") }
  OPTIONAL { ?person wdt:P18 ?img . }
  OPTIONAL {
    ?person wdt:P463 ?g2 .
    ?g2 wdt:P31/wdt:P279* wd:Q215380 .
    ?g2 rdfs:label ?groupName .
    FILTER(LANG(?groupName) = "en")
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ko". }
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

function pickName(binding: WikidataBindings): string | null {
  const full = binding.fullName?.value?.trim();
  const label = binding.personLabel?.value?.trim();
  const name = full || label;
  if (!name || /^Q\d+$/.test(name)) return null;
  return name.replace(/\s+/g, ' ');
}

/** Stable, human-readable filename keyed by artist id (e.g. mark-lee-q26689986.webp). */
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

function mapBinding(binding: WikidataBindings): MappedArtist | null {
  const personUri = binding.person?.value;
  if (!personUri) return null;
  const wikidataId = extractQid(personUri);
  const name = pickName(binding);
  const birthday = normalizeBirthday(binding.birthDate?.value);
  if (!name || !birthday) return null;

  return {
    commonsTitle: extractCommonsFileTitle(binding.image?.value),
    sourceImageUrl: null,
    entry: {
      id: wikidataId.toLowerCase(),
      name,
      group: binding.groupLabel?.value?.trim() ?? '',
      birthday,
      image: '',
      wikidataId,
    },
  };
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
        if (attempt < 3) await sleep(1000 * attempt);
      }
    }
    if (i + COMMONS_BATCH_SIZE < unique.length) await sleep(200);
  }

  log(`Resolved ${resolved.size}/${unique.length} source download URLs`);
  return resolved;
}

async function loadManifest(): Promise<ImageManifest> {
  try {
    const raw = await readFile(MANIFEST_PATH, 'utf8');
    return JSON.parse(raw) as ImageManifest;
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
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
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
      if (attempt < 5) {
        await sleep(1_000 * attempt);
      }
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

function dedupeAndSort(entries: BirthdayCatalogEntry[]): BirthdayCatalogEntry[] {
  const byId = new Map<string, BirthdayCatalogEntry>();
  for (const entry of entries) {
    const existing = byId.get(entry.wikidataId);
    if (!existing) {
      byId.set(entry.wikidataId, entry);
      continue;
    }
    const score = (e: BirthdayCatalogEntry) =>
      (e.group ? 2 : 0) + (e.image ? 1 : 0) + e.name.length / 100;
    if (score(entry) > score(existing)) byId.set(entry.wikidataId, entry);
  }
  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
  );
}

function assertPulseOnlyImages(entries: BirthdayCatalogEntry[], dataBaseUrl: string): void {
  const imagePrefix = `${dataBaseUrl}/images/`;
  const bad = entries.filter(
    (e) =>
      e.image &&
      (e.image.includes('wikimedia.org') ||
        e.image.includes('Special:FilePath') ||
        !e.image.startsWith(imagePrefix)),
  );
  if (bad.length) {
    throw new Error(
      `Refusing to write non-Pulse image URLs (e.g. ${bad[0]?.name}: ${bad[0]?.image})`,
    );
  }
}

async function main(): Promise<void> {
  log('Starting Pulse-owned birthday image sync…');
  const dataBaseUrl = getPulseDataBaseUrl();
  log(`Pulse data base URL: ${dataBaseUrl}`);

  await mkdir(IMAGES_DIR, { recursive: true });
  const manifest = await loadManifest();

  const payload = await fetchSparql(buildSparql());
  const bindings = payload.results?.bindings ?? [];
  log(`Received ${bindings.length} SPARQL bindings`);

  const mapped: MappedArtist[] = [];
  for (const binding of bindings) {
    const row = mapBinding(binding);
    if (row) mapped.push(row);
  }

  const titles = mapped
    .map((row) => row.commonsTitle)
    .filter((title): title is string => Boolean(title));
  const sourceByTitle = await resolveCommonsSourceUrls(titles);

  for (const row of mapped) {
    row.sourceImageUrl = row.commonsTitle ? sourceByTitle.get(row.commonsTitle) ?? null : null;
  }

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  const withSource = mapped.filter((row) => row.sourceImageUrl);
  log(`Processing ${withSource.length} artists with source images…`);

  await mapPool(withSource, DOWNLOAD_CONCURRENCY, async (row) => {
    const artistId = row.entry.id;
    const source = row.sourceImageUrl!;
    const filename = artistImageFilename(row.entry.name, artistId);
    const destPath = path.join(IMAGES_DIR, filename);
    const previous = manifest[artistId];

    try {
      if (
        previous &&
        previous.source === source &&
        previous.file === filename &&
        (await fileExists(path.join(IMAGES_DIR, previous.file)))
      ) {
        row.entry.image = hostedImageUrl(previous.file, dataBaseUrl);
        skipped += 1;
        return;
      }

      const bytes = await downloadSourceBytes(source);
      const sourceSha256 = createHash('sha256').update(bytes).digest('hex');

      if (
        previous &&
        previous.sourceSha256 === sourceSha256 &&
        previous.file === filename &&
        (await fileExists(path.join(IMAGES_DIR, previous.file)))
      ) {
        row.entry.image = hostedImageUrl(previous.file, dataBaseUrl);
        skipped += 1;
        return;
      }

      await writePulseWebp(bytes, destPath);
      manifest[artistId] = { file: filename, source, sourceSha256 };
      row.entry.image = hostedImageUrl(filename, dataBaseUrl);
      downloaded += 1;
      if (downloaded % 25 === 0) {
        log(`Downloaded/converted ${downloaded} images…`);
      }
      await sleep(DOWNLOAD_GAP_MS);
    } catch (error) {
      failed += 1;
      row.entry.image = '';
      log(
        `Image failed for ${row.entry.name} (${artistId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await sleep(DOWNLOAD_GAP_MS);
    }
  });

  // Artists without a source image keep image: ""
  const catalog = dedupeAndSort(mapped.map((row) => row.entry));
  assertPulseOnlyImages(catalog, dataBaseUrl);

  await saveManifest(manifest);
  await mkdir(path.dirname(OUTPUT_JSON_PATH), { recursive: true });
  await writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  const withImages = catalog.filter((e) => e.image).length;
  log(
    `Done. artists=${catalog.length} withPulseImages=${withImages} downloaded=${downloaded} skipped=${skipped} failed=${failed}`,
  );
  log(`Wrote ${OUTPUT_JSON_PATH}`);
}

main().catch((error) => {
  console.error('[updateBirthdays] Fatal:', error);
  process.exitCode = 1;
});
