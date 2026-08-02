import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Birthday, BirthdayCatalogEntry } from '@/models';
import { BIRTHDAYS_CACHE_TTL_MS, BIRTHDAYS_JSON_URL } from '@/constants/birthdays';

/** Bundled snapshot of data/birthdays.json — used only when remote + cache are unavailable. */
import bundledCatalogJson from '../../data/birthdays.json';

/** v4 invalidates caches that used a previous Pulse data base URL. */
const CACHE_PAYLOAD_KEY = 'pulse:birthdays:catalog:v4';
const CACHE_FETCHED_AT_KEY = 'pulse:birthdays:fetchedAt:v4';

const FETCH_MAX_RETRIES = 3;
const FETCH_RETRY_BASE_DELAY_MS = 800;

interface BirthdayCacheEnvelope {
  fetchedAt: number;
  entries: BirthdayCatalogEntry[];
}

/** Temporary end-to-end debug logger — remove once birthdays pipeline is verified. */
function debug(stage: string, message: string, payload?: unknown): void {
  if (payload !== undefined) {
    console.log(`[birthday-debug][${stage}] ${message}`, payload);
    return;
  }
  console.log(`[birthday-debug][${stage}] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCatalogEntry(value: unknown): value is BirthdayCatalogEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.group === 'string' &&
    typeof entry.birthday === 'string' &&
    typeof entry.image === 'string' &&
    typeof entry.wikidataId === 'string'
  );
}

function parseCatalog(payload: unknown, stage: string): BirthdayCatalogEntry[] {
  if (!Array.isArray(payload)) {
    debug(stage, 'Parse failed — payload is not an array', {
      type: typeof payload,
    });
    throw new Error('Birthday catalog must be a JSON array');
  }

  const entries = payload.filter(isCatalogEntry);
  debug(stage, 'Parsed catalog', {
    rawLength: payload.length,
    validEntries: entries.length,
    dropped: payload.length - entries.length,
    sample: entries.slice(0, 3).map((e) => ({
      name: e.name,
      birthday: e.birthday,
      group: e.group,
    })),
  });
  return entries;
}

async function readCache(): Promise<BirthdayCacheEnvelope | null> {
  try {
    const [raw, fetchedAtRaw] = await Promise.all([
      AsyncStorage.getItem(CACHE_PAYLOAD_KEY),
      AsyncStorage.getItem(CACHE_FETCHED_AT_KEY),
    ]);

    debug('4-cache-read', 'AsyncStorage keys', {
      hasPayload: Boolean(raw),
      payloadBytes: raw?.length ?? 0,
      fetchedAtRaw,
    });

    if (!raw || !fetchedAtRaw) {
      debug('4-cache-read', 'Cache miss — no payload and/or fetchedAt');
      return null;
    }

    const fetchedAt = Number(fetchedAtRaw);
    if (!Number.isFinite(fetchedAt)) {
      debug('4-cache-read', 'Cache invalid — fetchedAt is not a number', fetchedAtRaw);
      return null;
    }

    const entries = parseCatalog(JSON.parse(raw) as unknown, '4-cache-parse');
    debug('4-cache-read', 'Cache hit', {
      entries: entries.length,
      ageMs: Date.now() - fetchedAt,
      fresh: Date.now() - fetchedAt < BIRTHDAYS_CACHE_TTL_MS,
    });
    return { fetchedAt, entries };
  } catch (error) {
    debug('4-cache-read', 'Failed to read cache', error);
    return null;
  }
}

async function writeCache(entries: BirthdayCatalogEntry[], fetchedAt: number): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.setItem(CACHE_PAYLOAD_KEY, JSON.stringify(entries)),
      AsyncStorage.setItem(CACHE_FETCHED_AT_KEY, String(fetchedAt)),
    ]);
    debug('4-cache-write', 'Wrote catalog to AsyncStorage', {
      entries: entries.length,
      fetchedAt,
      fetchedAtIso: new Date(fetchedAt).toISOString(),
    });
  } catch (error) {
    debug('4-cache-write', 'Failed to write cache', error);
  }
}

function isFresh(fetchedAt: number, now: number = Date.now()): boolean {
  return now - fetchedAt < BIRTHDAYS_CACHE_TTL_MS;
}

function getBundledCatalog(): BirthdayCatalogEntry[] {
  const entries = parseCatalog(bundledCatalogJson as unknown, '1-bundled');
  debug('1-bundled', 'Using bundled data/birthdays.json snapshot', {
    entries: entries.length,
  });
  return entries;
}

async function downloadCatalog(url: string): Promise<BirthdayCatalogEntry[]> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= FETCH_MAX_RETRIES; attempt += 1) {
    try {
      debug('1-download', `Fetching catalog (attempt ${attempt}/${FETCH_MAX_RETRIES})`, { url });
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      debug('1-download', 'HTTP response', {
        status: response.status,
        ok: response.ok,
        url,
        attempt,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      debug('2-parse', 'JSON body received', {
        isArray: Array.isArray(payload),
        type: typeof payload,
      });

      const entries = parseCatalog(payload, '3-parse');
      debug('1-download', 'Download success', { entries: entries.length });
      return entries;
    } catch (error) {
      lastError = error;
      debug('1-download', `Attempt ${attempt} failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      if (attempt < FETCH_MAX_RETRIES) {
        await sleep(FETCH_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Returns the full birthday catalog, preferring a fresh remote download and
 * falling back to the 24h on-device cache when offline or the CDN is unreachable.
 * Never queries Wikidata from the mobile app.
 */
export async function getBirthdayCatalog(): Promise<BirthdayCatalogEntry[]> {
  debug('0-start', 'Resolving birthday catalog', {
    url: BIRTHDAYS_JSON_URL || '(unset — bundled fallback only)',
    cacheTtlMs: BIRTHDAYS_CACHE_TTL_MS,
  });

  const cached = await readCache();
  const now = Date.now();

  if (cached && isFresh(cached.fetchedAt, now)) {
    debug('0-start', 'Using fresh AsyncStorage cache', {
      entries: cached.entries.length,
    });
    return cached.entries;
  }

  if (!BIRTHDAYS_JSON_URL) {
    debug('0-start', 'EXPO_PUBLIC_PULSE_DATA_BASE_URL unset — using bundled catalog');
    const bundled = getBundledCatalog();
    if (bundled.length) {
      await writeCache(bundled, now);
      return bundled;
    }
    return [];
  }

  try {
    const entries = await downloadCatalog(BIRTHDAYS_JSON_URL);
    await writeCache(entries, now);
    return entries;
  } catch (error) {
    debug('1-download', 'Remote catalog unavailable', {
      error: error instanceof Error ? error.message : String(error),
      hasStaleCache: Boolean(cached?.entries.length),
    });

    if (cached?.entries.length) {
      debug('0-start', 'Falling back to stale AsyncStorage cache', {
        entries: cached.entries.length,
      });
      return cached.entries;
    }

    // Same birthdays.json content, shipped with the binary so Home works when
    // the configured remote URL is not published yet (e.g. GitHub 404).
    const bundled = getBundledCatalog();
    if (bundled.length) {
      await writeCache(bundled, now);
      debug('0-start', 'Seeded cache from bundled birthdays.json', {
        entries: bundled.length,
      });
      return bundled;
    }

    debug('0-start', 'No catalog available (remote failed, cache empty, bundle empty)');
    return [];
  }
}

function computeTurningAge(birthDate: string, today: Date): number | undefined {
  const year = Number(birthDate.slice(0, 4));
  if (!Number.isFinite(year) || year < 1000) return undefined;
  return today.getFullYear() - year;
}

function matchesToday(birthday: string, today: Date): boolean {
  if (birthday.length < 10) return false;
  const month = Number(birthday.slice(5, 7));
  const day = Number(birthday.slice(8, 10));
  return month === today.getMonth() + 1 && day === today.getDate();
}

function toBirthday(entry: BirthdayCatalogEntry, today: Date): Birthday {
  return {
    id: `bday-${entry.wikidataId}`,
    artistId: entry.wikidataId,
    name: entry.name,
    groupName: entry.group || undefined,
    avatarUrl: entry.image || '',
    birthDate: entry.birthday,
    turningAge: computeTurningAge(entry.birthday, today),
  };
}

/**
 * Today's birthdays for the Home screen. Loads the remote/local catalog and
 * filters by the device's local month/day — no live Wikidata queries.
 */
export async function getTodaysBirthdays(now: Date = new Date()): Promise<Birthday[]> {
  try {
    const catalog = await getBirthdayCatalog();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    const todays = catalog
      .filter((entry) => matchesToday(entry.birthday, now))
      .map((entry) => toBirthday(entry, now))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

    debug('5-filter', 'getTodaysBirthdays() result', {
      deviceNow: now.toString(),
      month,
      day,
      catalogSize: catalog.length,
      todayCount: todays.length,
      names: todays.map((b) => b.name),
    });

    return todays;
  } catch (error) {
    debug('5-filter', 'Failed to resolve today\'s birthdays', error);
    return [];
  }
}
