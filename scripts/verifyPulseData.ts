/**
 * Verify Pulse birthday catalog + hosted images.
 *
 * Modes:
 *   local  — every referenced image exists under data/images/ and URLs use the base
 *   remote — birthdays.json + every image URL returns HTTP 200 with image/webp
 *   all    — local then remote (default for CI after publish)
 *
 * Usage:
 *   npx tsx scripts/verifyPulseData.ts [local|remote|all]
 *
 * On failure: exits non-zero and prints the exact failing URL.
 */

import { access } from 'node:fs/promises';
import path from 'node:path';

import type { BirthdayCatalogEntry } from '../src/models/birthday';
import {
  birthdaysJsonUrl,
  getPulseDataBaseUrl,
  imageFilenameFromUrl,
} from './pulseDataUrl';

const ROOT = process.cwd();
const OUTPUT_JSON_PATH = path.join(ROOT, 'data', 'birthdays.json');
const IMAGES_DIR = path.join(ROOT, 'data', 'images');

const REMOTE_RETRIES = 8;
const REMOTE_RETRY_DELAY_MS = 2_500;
const REMOTE_CONCURRENCY = 12;

type Mode = 'local' | 'remote' | 'all';

function log(message: string): void {
  console.log(`[verifyPulseData] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message: string): never {
  console.error(`[verifyPulseData] FAIL: ${message}`);
  process.exit(1);
}

async function loadCatalog(): Promise<BirthdayCatalogEntry[]> {
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(OUTPUT_JSON_PATH, 'utf8');
  const payload = JSON.parse(raw) as unknown;
  if (!Array.isArray(payload)) {
    fail(`${OUTPUT_JSON_PATH} is not a JSON array`);
  }
  return payload as BirthdayCatalogEntry[];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function verifyLocal(catalog: BirthdayCatalogEntry[], baseUrl: string): Promise<void> {
  log(`Local verification against base ${baseUrl}`);
  let withImages = 0;

  for (const entry of catalog) {
    if (!entry.image) continue;
    withImages += 1;

    if (entry.image.includes('wikimedia.org') || entry.image.includes('Special:FilePath')) {
      fail(`Non-Pulse image URL for ${entry.name}: ${entry.image}`);
    }

    if (!entry.image.startsWith(`${baseUrl}/images/`)) {
      fail(
        `Image URL does not use EXPO_PUBLIC_PULSE_DATA_BASE_URL for ${entry.name}: ${entry.image}`,
      );
    }

    const filename = imageFilenameFromUrl(entry.image);
    if (!filename) {
      fail(`Could not parse image filename from URL: ${entry.image}`);
    }

    const localPath = path.join(IMAGES_DIR, filename);
    if (!(await fileExists(localPath))) {
      fail(`Missing local image for ${entry.name}: ${entry.image} (expected ${localPath})`);
    }
  }

  log(`Local OK — ${withImages} image files present, catalog size ${catalog.length}`);
}

async function fetchOnce(
  url: string,
  accept: string,
): Promise<{ status: number; contentType: string; ok: boolean }> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: accept },
    redirect: 'follow',
  });
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    ok: response.ok,
  };
}

async function fetchWithRetries(
  url: string,
  accept: string,
): Promise<{ status: number; contentType: string }> {
  let lastStatus = 0;
  let lastType = '';

  for (let attempt = 1; attempt <= REMOTE_RETRIES; attempt += 1) {
    try {
      const result = await fetchOnce(url, accept);
      lastStatus = result.status;
      lastType = result.contentType;
      if (result.ok) {
        return { status: result.status, contentType: result.contentType };
      }
      if (result.status === 401 || result.status === 403) {
        fail(`HTTP ${result.status} for ${url}`);
      }
    } catch (error) {
      log(
        `Network error on attempt ${attempt}/${REMOTE_RETRIES} for ${url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (attempt < REMOTE_RETRIES) {
      log(`Retry ${attempt}/${REMOTE_RETRIES} — HTTP ${lastStatus || 'n/a'} for ${url}`);
      await sleep(REMOTE_RETRY_DELAY_MS * attempt);
    }
  }

  fail(`HTTP ${lastStatus || 'n/a'} for ${url} (content-type: ${lastType || 'none'})`);
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
}

async function verifyRemote(catalog: BirthdayCatalogEntry[], baseUrl: string): Promise<void> {
  const catalogUrl = birthdaysJsonUrl(baseUrl);
  log(`Remote verification — catalog ${catalogUrl}`);

  await fetchWithRetries(catalogUrl, 'application/json,text/plain,*/*');

  // Confirm body parses as array (same path the app uses).
  {
    const response = await fetch(catalogUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      fail(`HTTP ${response.status} for ${catalogUrl}`);
    }
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      fail(`Remote catalog is not a JSON array: ${catalogUrl}`);
    }
    log(`Remote catalog OK — ${(payload as unknown[]).length} entries (app download path)`);
  }

  const imageUrls = catalog.map((e) => e.image).filter((url): url is string => Boolean(url));
  log(`Checking ${imageUrls.length} remote image URLs…`);

  let checked = 0;
  await mapPool(imageUrls, REMOTE_CONCURRENCY, async (url) => {
    const result = await fetchWithRetries(url, 'image/webp,image/*,*/*');
    const type = result.contentType.toLowerCase();
    if (!type.includes('image/webp')) {
      fail(`Expected Content-Type image/webp, got "${result.contentType || '(empty)'}" for ${url}`);
    }
    checked += 1;
    if (checked % 100 === 0) {
      log(`Remote images verified: ${checked}/${imageUrls.length}`);
    }
  });

  log(`Remote OK — birthdays.json + ${imageUrls.length} images returned HTTP 200 image/webp`);
}

async function main(): Promise<void> {
  const mode = ((process.argv[2] as Mode | undefined) ?? 'all') as Mode;
  if (!['local', 'remote', 'all'].includes(mode)) {
    fail(`Unknown mode "${mode}". Use local | remote | all`);
  }

  const baseUrl = getPulseDataBaseUrl();
  log(`EXPO_PUBLIC_PULSE_DATA_BASE_URL → ${baseUrl}`);

  const catalog = await loadCatalog();

  if (mode === 'local' || mode === 'all') {
    await verifyLocal(catalog, baseUrl);
  }
  if (mode === 'remote' || mode === 'all') {
    await verifyRemote(catalog, baseUrl);
  }

  log('All verification checks passed.');
}

main().catch((error) => {
  console.error('[verifyPulseData] Fatal:', error);
  process.exitCode = 1;
});
