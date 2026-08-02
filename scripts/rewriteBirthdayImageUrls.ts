/**
 * Rewrite data/birthdays.json image fields to use EXPO_PUBLIC_PULSE_DATA_BASE_URL.
 * Does not re-download images — only rewrites hosted URLs from local filenames.
 *
 * Run: npx tsx scripts/rewriteBirthdayImageUrls.ts
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { BirthdayCatalogEntry } from '../src/models/birthday';
import { getPulseDataBaseUrl, hostedImageUrl, imageFilenameFromUrl } from './pulseDataUrl';

const OUTPUT_JSON_PATH = path.join(process.cwd(), 'data', 'birthdays.json');

async function main(): Promise<void> {
  const baseUrl = getPulseDataBaseUrl();
  console.log(`[rewriteBirthdayImageUrls] base=${baseUrl}`);

  const raw = await readFile(OUTPUT_JSON_PATH, 'utf8');
  const catalog = JSON.parse(raw) as BirthdayCatalogEntry[];
  if (!Array.isArray(catalog)) {
    throw new Error('birthdays.json must be an array');
  }

  let rewritten = 0;
  const next = catalog.map((entry) => {
    if (!entry.image) return entry;
    const filename = imageFilenameFromUrl(entry.image);
    if (!filename) {
      throw new Error(`Cannot derive filename from image URL: ${entry.image}`);
    }
    const image = hostedImageUrl(filename, baseUrl);
    if (image !== entry.image) rewritten += 1;
    return { ...entry, image };
  });

  await writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(
    `[rewriteBirthdayImageUrls] Wrote ${OUTPUT_JSON_PATH} (rewrote ${rewritten}/${catalog.length} image URLs)`,
  );
}

main().catch((error) => {
  console.error('[rewriteBirthdayImageUrls] Fatal:', error);
  process.exitCode = 1;
});
