/**
 * Stage / commit / push Pulse birthday catalog + images, then fail-closed
 * verify that every referenced image URL returns HTTP 200.
 *
 * Used by `updateBirthdays.ts` so `npm run update:birthdays` never leaves
 * unpublished image URLs in birthdays.json.
 *
 * Skip with PULSE_SKIP_PUBLISH=1 (local dry-runs).
 */

import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { BirthdayCatalogEntry } from '../src/models/birthday';
import { getPulseDataBaseUrl, imageFilenameFromUrl } from './pulseDataUrl';

const ROOT = process.cwd();
const OUTPUT_JSON_PATH = path.join(ROOT, 'data', 'birthdays.json');
const AUDIT_JSON_PATH = path.join(ROOT, 'data', 'birthday-image-audit.json');
const IMAGES_DIR = path.join(ROOT, 'data', 'images');

const PUBLISH_PATHS = [
  'data/birthdays.json',
  'data/birthday-image-audit.json',
  'data/images/',
];

function log(message: string): void {
  console.log(`[publishPulseData] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runGit(
  args: string[],
  opts: { allowFail?: boolean } = {},
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const status = result.status ?? 1;
  const stdout = (result.stdout || '').toString();
  const stderr = (result.stderr || '').toString();
  if (status !== 0 && !opts.allowFail) {
    throw new Error(`git ${args.join(' ')} failed (${status}): ${(stderr || stdout).trim()}`);
  }
  return { status, stdout, stderr };
}

function runTsx(scriptArgs: string[]): void {
  const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const result = spawnSync(process.execPath, [tsxCli, ...scriptArgs], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
    env: process.env,
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`tsx ${scriptArgs.join(' ')} failed (${result.status ?? 1})`);
  }
}

function resolveCommitIdentity(): { name: string; email: string } {
  if (process.env.GITHUB_ACTIONS === 'true') {
    return {
      name: 'github-actions[bot]',
      email: '41898282+github-actions[bot]@users.noreply.github.com',
    };
  }

  const name =
    runGit(['config', 'user.name'], { allowFail: true }).stdout.trim() ||
    process.env.GIT_AUTHOR_NAME?.trim() ||
    'pulse-birthday-bot';
  const email =
    runGit(['config', 'user.email'], { allowFail: true }).stdout.trim() ||
    process.env.GIT_AUTHOR_EMAIL?.trim() ||
    'pulse-birthday-bot@users.noreply.github.com';
  return { name, email };
}

async function loadCatalog(): Promise<BirthdayCatalogEntry[]> {
  const raw = await readFile(OUTPUT_JSON_PATH, 'utf8');
  const payload = JSON.parse(raw) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error(`${OUTPUT_JSON_PATH} is not a JSON array`);
  }
  return payload as BirthdayCatalogEntry[];
}

async function stripUnpublishedUrls(failedUrls: Set<string>): Promise<number> {
  const catalog = await loadCatalog();
  let cleared = 0;
  for (const entry of catalog) {
    if (entry.image && failedUrls.has(entry.image)) {
      entry.image = '';
      cleared += 1;
    }
  }
  if (cleared > 0) {
    await writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  }
  return cleared;
}

async function probeUrl(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'image/webp,image/*,*/*' },
    });
    const type = (response.headers.get('content-type') || '').toLowerCase();
    const ok =
      response.ok &&
      (type.includes('image') || type.includes('octet-stream') || type.includes('webp'));
    return { ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function findFailingImageUrls(catalog: BirthdayCatalogEntry[]): Promise<string[]> {
  const urls = catalog.map((e) => e.image).filter((u): u is string => Boolean(u?.trim()));
  const failing: string[] = [];
  const concurrency = 12;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < urls.length) {
      const index = next;
      next += 1;
      const url = urls[index]!;
      let ok = false;
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const result = await probeUrl(url);
        if (result.ok) {
          ok = true;
          break;
        }
        if (result.status === 404 || result.status === 403 || result.status === 401) break;
        await sleep(1500 * attempt);
      }
      if (!ok) failing.push(url);
      if ((index + 1) % 100 === 0) {
        log(`Post-publish probe ${index + 1}/${urls.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()));
  return failing;
}

function commitIfNeeded(message: string): boolean {
  const identity = resolveCommitIdentity();
  runGit(['add', '--', ...PUBLISH_PATHS]);
  const staged = runGit(['diff', '--cached', '--name-only'], { allowFail: true }).stdout.trim();
  if (!staged) {
    log('No staged birthday/image changes to commit.');
    return false;
  }

  log(`Committing:\n${staged.split(/\r?\n/).slice(0, 30).join('\n')}`);
  runGit([
    '-c',
    `user.name=${identity.name}`,
    '-c',
    `user.email=${identity.email}`,
    'commit',
    '-m',
    message,
  ]);
  return true;
}

function pushHostingBranch(): void {
  const branch =
    process.env.PULSE_GITHUB_BRANCH?.trim() ||
    runGit(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();

  if (!branch || branch === 'HEAD') {
    throw new Error('Cannot determine hosting branch to push (detached HEAD?).');
  }

  log(`Pushing to origin ${branch}…`);
  const push = runGit(['push', '-u', 'origin', `HEAD:${branch}`], { allowFail: true });
  if (push.status !== 0) {
    throw new Error(
      `git push failed for origin/${branch}: ${(push.stderr || push.stdout).trim()}`,
    );
  }
  if (push.stdout.trim()) log(push.stdout.trim());
  if (push.stderr.trim()) log(push.stderr.trim());
}

/**
 * Publish local catalog/images and verify every referenced URL is live.
 */
export async function publishPulseDataAndVerify(): Promise<void> {
  if (process.env.PULSE_SKIP_PUBLISH === '1' || process.env.PULSE_SKIP_PUBLISH === 'true') {
    log('PULSE_SKIP_PUBLISH set — skipping git publish + remote verify.');
    return;
  }

  const dataBaseUrl = getPulseDataBaseUrl();
  log(`Hosting base: ${dataBaseUrl}`);

  log('Local verification before publish…');
  runTsx(['scripts/verifyPulseData.ts', 'local']);

  const committed = commitIfNeeded('chore(birthdays): refresh catalog and Pulse-hosted images');
  if (committed) {
    pushHostingBranch();
  } else {
    log('Working tree already published locally — still verifying remote URLs.');
  }

  await sleep(Number(process.env.PULSE_PUBLISH_PROPAGATION_MS || 5000));

  log('Remote verification (fail closed)…');
  try {
    runTsx(['scripts/verifyPulseData.ts', 'remote']);
    log('Publish + remote verification succeeded.');
    return;
  } catch (error) {
    log(
      `Remote verify failed: ${error instanceof Error ? error.message : String(error)}. Probing individual URLs…`,
    );
  }

  const catalog = await loadCatalog();
  const failing = await findFailingImageUrls(catalog);
  if (!failing.length) {
    runTsx(['scripts/verifyPulseData.ts', 'remote']);
    return;
  }

  log(`Clearing ${failing.length} unpublished/broken image URLs from birthdays.json…`);
  for (const url of failing.slice(0, 20)) {
    log(`  - ${imageFilenameFromUrl(url) || url}`);
  }

  const cleared = await stripUnpublishedUrls(new Set(failing));
  if (cleared > 0) {
    try {
      const auditRaw = await readFile(AUDIT_JSON_PATH, 'utf8');
      const audit = JSON.parse(auditRaw) as Record<string, unknown>;
      audit.unpublishedUrlsClearedAt = new Date().toISOString();
      audit.unpublishedUrlsCleared = failing.length;
      await writeFile(AUDIT_JSON_PATH, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
    } catch {
      // optional
    }

    if (
      commitIfNeeded(
        'fix(birthdays): clear image URLs that failed post-publish verification',
      )
    ) {
      pushHostingBranch();
    }
  }

  throw new Error(
    `Published catalog contained ${failing.length} image URL(s) that did not return HTTP 200. ` +
      `Cleared those URLs from birthdays.json and re-pushed. ` +
      `Local files under ${IMAGES_DIR} may need another successful publish. ` +
      `Sample: ${failing[0]}`,
  );
}

async function main(): Promise<void> {
  await publishPulseDataAndVerify();
}

main().catch((error) => {
  console.error('[publishPulseData] Fatal:', error);
  process.exitCode = 1;
});
