/**
 * Scrape Melon new music → data/new-releases.json (count + songs only).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { fetchMelonNewReleases } from './releases/fetchMelonNewReleases';

async function main(): Promise<void> {
  const result = await fetchMelonNewReleases();
  const generatedAt = new Date().toISOString();

  const payload = {
    generatedAt,
    count: result.count,
    songs: result.songs,
  };

  const outDir = path.join(process.cwd(), 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'new-releases.json');
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(
    `[updateReleases] Wrote ${result.songs.length} songs (count=${result.count}) → ${outPath}`,
  );
}

main().catch((error) => {
  console.error('[updateReleases] Failed', error);
  process.exit(1);
});
