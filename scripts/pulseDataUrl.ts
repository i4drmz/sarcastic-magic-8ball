/**
 * Shared Pulse data URL helpers for sync / verify scripts.
 * Single source of truth: EXPO_PUBLIC_PULSE_DATA_BASE_URL
 * Example: https://raw.githubusercontent.com/<user>/<repo>/main/data
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Load committed/.local .env into process.env when scripts run outside Expo. */
function loadDotEnv(): void {
  for (const name of ['.env', '.env.local']) {
    const filePath = path.join(process.cwd(), name);
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

loadDotEnv();

export function getPulseDataBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_PULSE_DATA_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }

  // CI convenience: derive from the Actions checkout when the env var is unset.
  const repo = process.env.GITHUB_REPOSITORY?.trim();
  const branch =
    process.env.PULSE_GITHUB_BRANCH?.trim() ||
    process.env.GITHUB_REF_NAME?.trim() ||
    'main';

  if (repo) {
    return `https://raw.githubusercontent.com/${repo}/${branch}/data`;
  }

  throw new Error(
    'EXPO_PUBLIC_PULSE_DATA_BASE_URL is required. ' +
      'Example: https://raw.githubusercontent.com/<user>/<repo>/main/data',
  );
}

export function birthdaysJsonUrl(baseUrl: string = getPulseDataBaseUrl()): string {
  return `${baseUrl.replace(/\/+$/, '')}/birthdays.json`;
}

export function eventsJsonUrl(baseUrl: string = getPulseDataBaseUrl()): string {
  return `${baseUrl.replace(/\/+$/, '')}/events.json`;
}

export function newReleasesJsonUrl(baseUrl: string = getPulseDataBaseUrl()): string {
  return `${baseUrl.replace(/\/+$/, '')}/new-releases.json`;
}

export function hostedImageUrl(filename: string, baseUrl: string = getPulseDataBaseUrl()): string {
  const base = baseUrl.replace(/\/+$/, '');
  const file = filename.replace(/^\/+/, '');
  return `${base}/images/${file}`;
}

/** Extract the filename from a Pulse image URL (or return basename of a local path). */
export function imageFilenameFromUrl(imageUrl: string): string | null {
  const trimmed = imageUrl.trim();
  if (!trimmed) return null;
  try {
    const pathname = new URL(trimmed).pathname;
    const marker = '/images/';
    const idx = pathname.lastIndexOf(marker);
    if (idx !== -1) {
      return decodeURIComponent(pathname.slice(idx + marker.length));
    }
    const base = pathname.split('/').pop();
    return base || null;
  } catch {
    const base = trimmed.split(/[\\/]/).pop();
    return base || null;
  }
}
