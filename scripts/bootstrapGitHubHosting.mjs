/**
 * Create/configure the public GitHub hosting repo, rewrite asset URLs,
 * commit/push data, and fail-closed verify remote HTTP responses.
 *
 * Prerequisites: `gh auth login` (GitHub CLI).
 * Usage: node scripts/bootstrapGitHubHosting.mjs [repo-name]
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPO_NAME = process.argv[2] || 'sarcastic-magic-8ball';
const BRANCH = 'main';

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
    ...opts,
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status}): ${err}`);
  }
  return (result.stdout || '').trim();
}

function runInherit(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status})`);
  }
}

function ghPath() {
  if (process.platform === 'win32') {
    const candidate = path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'GitHub CLI', 'gh.exe');
    if (existsSync(candidate)) return candidate;
  }
  return 'gh';
}

function main() {
  const gh = ghPath();
  console.log('[bootstrap] Checking GitHub auth…');
  const auth = spawnSync(gh, ['auth', 'status'], { encoding: 'utf8', windowsHide: true });
  if (auth.status !== 0) {
    console.error('[bootstrap] Not logged into GitHub.');
    console.error('Run: gh auth login --hostname github.com --git-protocol https --web');
    console.error(auth.stderr || auth.stdout || '');
    process.exit(1);
  }

  const login = run(gh, ['api', 'user', '--jq', '.login']);
  if (!login) throw new Error('Could not resolve GitHub username');
  console.log(`[bootstrap] Authenticated as ${login}`);

  const fullName = `${login}/${REPO_NAME}`;
  const baseUrl = `https://raw.githubusercontent.com/${fullName}/${BRANCH}/data`;
  const visibilityCheck = spawnSync(gh, ['repo', 'view', fullName, '--json', 'name'], {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (visibilityCheck.status !== 0) {
    console.log(`[bootstrap] Creating public repository ${fullName}…`);
    runInherit(gh, [
      'repo',
      'create',
      REPO_NAME,
      '--public',
      '--description',
      'Pulse K-pop companion — app + hosted birthday data assets',
      '--disable-wiki',
      '--disable-issues=false',
    ]);
  } else {
    console.log(`[bootstrap] Repository ${fullName} already exists`);
    // Ensure public for raw.githubusercontent.com anonymous access
    runInherit(gh, ['repo', 'edit', fullName, '--visibility', 'public', '--accept-visibility-change-consequences']);
  }

  const envPath = path.join(ROOT, '.env');
  writeFileSync(envPath, `EXPO_PUBLIC_PULSE_DATA_BASE_URL=${baseUrl}\n`, 'utf8');
  console.log(`[bootstrap] Wrote .env → ${baseUrl}`);

  process.env.EXPO_PUBLIC_PULSE_DATA_BASE_URL = baseUrl;

  const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  console.log('[bootstrap] Rewriting birthdays.json image URLs…');
  runInherit(process.execPath, [tsxCli, 'scripts/rewriteBirthdayImageUrls.ts']);

  console.log('[bootstrap] Local verification…');
  runInherit(process.execPath, [tsxCli, 'scripts/verifyPulseData.ts', 'local']);

  // Reset messy index from legacy Android staging, then add Expo project files.
  console.log('[bootstrap] Preparing git commit…');
  run('git', ['reset']);
  // Prefer main
  const branch = spawnSync('git', ['branch', '--show-current'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if ((branch.stdout || '').trim() !== BRANCH) {
    spawnSync('git', ['branch', '-M', BRANCH], {
      cwd: ROOT,
      windowsHide: true,
    });
  }

  runInherit('git', [
    'add',
    '.env',
    '.env.example',
    '.gitignore',
    '.github',
    'AGENTS.md',
    'CLAUDE.md',
    'README.md',
    'app.json',
    'assets',
    'babel.config.js',
    'data',
    'metro.config.js',
    'nativewind-env.d.ts',
    'package.json',
    'package-lock.json',
    'scripts',
    'src',
    'tailwind.config.js',
    'tsconfig.json',
  ]);

  const status = run('git', ['status', '--porcelain']);
  if (!status) {
    console.log('[bootstrap] Nothing to commit — checking remote sync');
  } else {
    // Use gh identity for this commit only — do not mutate global git config.
    const name = run(gh, ['api', 'user', '--jq', '.name']) || login;
    const email = `${login}@users.noreply.github.com`;
    runInherit('git', [
      '-c',
      `user.name=${name}`,
      '-c',
      `user.email=${email}`,
      'commit',
      '-m',
      'chore: publish Pulse app with hosted birthday data pipeline',
    ]);
  }

  // Configure remote
  const remotes = spawnSync('git', ['remote'], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  const remoteList = (remotes.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  const repoUrl = `https://github.com/${fullName}.git`;
  if (!remoteList.includes('origin')) {
    runInherit('git', ['remote', 'add', 'origin', repoUrl]);
  } else {
    runInherit('git', ['remote', 'set-url', 'origin', repoUrl]);
  }

  console.log('[bootstrap] Pushing to origin…');
  runInherit('git', ['push', '-u', 'origin', BRANCH]);

  console.log('[bootstrap] Remote verification (fail closed)…');
  // Brief propagation delay
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  runInherit(process.execPath, [
    path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    'scripts/verifyPulseData.ts',
    'remote',
  ]);

  // Sanity: app catalog URL
  const catalogUrl = `${baseUrl}/birthdays.json`;
  const sample = JSON.parse(readFileSync(path.join(ROOT, 'data', 'birthdays.json'), 'utf8'))
    .find((e) => e.image);
  console.log('[bootstrap] SUCCESS');
  console.log(`  repo:    https://github.com/${fullName}`);
  console.log(`  base:    ${baseUrl}`);
  console.log(`  catalog: ${catalogUrl}`);
  if (sample?.image) console.log(`  sample:  ${sample.image}`);
}

try {
  main();
} catch (error) {
  console.error('[bootstrap] FAIL:', error instanceof Error ? error.message : error);
  process.exit(1);
}
