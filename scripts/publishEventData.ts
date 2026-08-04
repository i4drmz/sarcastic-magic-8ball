/**
 * Stage / commit / push data/events.json (+ pipeline log) when changed.
 * Verify remote via GitHub Contents API.
 */

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { PulseEventCatalog } from '../src/models/pulseEvent';
import { eventsJsonUrl, getPulseDataBaseUrl } from './pulseDataUrl';

const ROOT = process.cwd();
const OUTPUT_JSON_PATH = path.join(ROOT, 'data', 'events.json');
const PUBLISH_PATHS = ['data/events.json', 'data/event-pipeline-log.json'];

function log(message: string): void {
  console.log(`[publishEventData] ${message}`);
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
    'pulse-events-bot';
  const email =
    runGit(['config', 'user.email'], { allowFail: true }).stdout.trim() ||
    process.env.GIT_AUTHOR_EMAIL?.trim() ||
    'pulse-events-bot@users.noreply.github.com';
  return { name, email };
}

function resolveContentsApiUrl(rawUrl: string): string | null {
  const match = rawUrl.match(
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/data\/events\.json\/?$/i,
  );
  if (!match) return null;
  const [, owner, repo, ref] = match;
  return `https://api.github.com/repos/${owner}/${repo}/contents/data/events.json?ref=${encodeURIComponent(ref)}`;
}

async function verifyRemote(local: PulseEventCatalog): Promise<void> {
  const rawUrl = eventsJsonUrl(getPulseDataBaseUrl());
  const apiUrl = resolveContentsApiUrl(rawUrl) || rawUrl;
  const headers: Record<string, string> = apiUrl.includes('api.github.com')
    ? {
        Accept: 'application/vnd.github.raw+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
    : { Accept: 'application/json' };

  let lastError: unknown;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(apiUrl, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remote = (await response.json()) as PulseEventCatalog;
      if (!remote || !Array.isArray(remote.events)) {
        throw new Error('Remote payload missing events[]');
      }
      if (remote.events.length !== local.events.length) {
        throw new Error(
          `Count mismatch local=${local.events.length} remote=${remote.events.length}`,
        );
      }
      const localIds = new Set(local.events.map((e) => e.id));
      const remoteIds = new Set(remote.events.map((e) => e.id));
      const sameIds =
        localIds.size === remoteIds.size && [...localIds].every((id) => remoteIds.has(id));
      if (!sameIds) throw new Error(`id set mismatch (attempt ${attempt})`);
      log(`Remote verify OK (${remote.events.length} events)`);
      return;
    } catch (error) {
      lastError = error;
      log(`Remote verify attempt ${attempt}/6 failed: ${String(error)}`);
      await sleep(2000 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function publishEventData(): Promise<boolean> {
  if (process.env.PULSE_SKIP_PUBLISH === '1') {
    log('PULSE_SKIP_PUBLISH=1 — skipping git publish');
    return false;
  }

  const local = JSON.parse(await readFile(OUTPUT_JSON_PATH, 'utf8')) as PulseEventCatalog;

  runGit(['add', '--', ...PUBLISH_PATHS]);
  const status = runGit(['status', '--porcelain', '--', ...PUBLISH_PATHS]);
  if (!status.stdout.trim()) {
    log('Nothing staged — events already up to date in git');
    return false;
  }

  const identity = resolveCommitIdentity();
  const branch =
    process.env.PULSE_GITHUB_BRANCH?.trim() ||
    process.env.GITHUB_REF_NAME?.trim() ||
    runGit(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();

  const count = local.events?.length ?? 0;
  runGit([
    '-c',
    `user.name=${identity.name}`,
    '-c',
    `user.email=${identity.email}`,
    'commit',
    '-m',
    `chore(events): sync upcoming catalog (${count} events)`,
  ]);

  log(`Pushing to ${branch}…`);
  runGit(['push', 'origin', `HEAD:${branch}`]);
  await verifyRemote(local);
  return true;
}

async function main(): Promise<void> {
  const published = await publishEventData();
  log(published ? 'Done (published)' : 'Done (no changes)');
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('/publishEventData.ts');
if (invokedDirectly) {
  main().catch((error) => {
    console.error('[publishEventData] FATAL', error);
    process.exitCode = 1;
  });
}
