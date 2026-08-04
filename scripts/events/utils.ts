import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { BirthdayCatalogEntry } from '../../src/models/birthday';
import type { PulseEvent, PulseEventType } from '../../src/models/pulseEvent';
import { PULSE_EVENT_TYPES } from '../../src/models/pulseEvent';

const ROOT = process.cwd();
const BIRTHDAYS_JSON_PATH = path.join(ROOT, 'data', 'birthdays.json');

export const PRIORITY_ACTS = [
  'BTS',
  'BLACKPINK',
  'Stray Kids',
  'TWICE',
  'SEVENTEEN',
  'NewJeans',
  'IVE',
  'aespa',
  'LE SSERAFIM',
  'TXT',
  'ENHYPEN',
  'ATEEZ',
  'ITZY',
  'NCT',
  'NCT 127',
  'NCT Dream',
  'WayV',
  'EXO',
  'Red Velvet',
  'IU',
  '(G)I-DLE',
  'Illit',
  'BABYMONSTER',
  'TREASURE',
  'ZEROBASEONE',
  'RIIZE',
  'BOYNEXTDOOR',
  'TWS',
  'KISS OF LIFE',
  'fromis_9',
  'STAYC',
  'NMIXX',
  'Kep1er',
  'Dreamcatcher',
  'MAMAMOO',
  'MONSTA X',
  'GOT7',
  'SHINee',
  'KCON',
  'MAMA',
] as const;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function todayUtcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function stableHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 16);
}

export function normalizeKeyPart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function parseLatLon(
  latRaw: string | number | null | undefined,
  lonRaw: string | number | null | undefined,
): { latitude: number | null; longitude: number | null } {
  const latitude = latRaw === '' || latRaw == null ? NaN : Number(latRaw);
  const longitude = lonRaw === '' || lonRaw == null ? NaN : Number(lonRaw);
  return {
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

export function classifyEventType(text: string): PulseEventType {
  const t = text.toLowerCase();
  if (/\bfansign\b|\bfan[\s-]?sign\b|\bhi[\s-]?touch\b/.test(t)) return 'Fansign';
  if (/\bfan[\s-]?meeting\b|\bfanmeeting\b|\bfan[\s-]?meet\b|\bfansignature\b/.test(t)) {
    return 'Fan Meeting';
  }
  if (/\bpop[\s-]?up\b|\bpopup store\b|\bpop up store\b/.test(t)) return 'Pop-up Store';
  if (/\balbum release\b|\brelease party\b|\blistening party\b|\bcomeback showcase\b/.test(t)) {
    return 'Album Release';
  }
  if (/\bexhibition\b|\bmuseum\b|\bgallery\b|\bexhibit\b/.test(t)) return 'Exhibition';
  if (/\bconvention\b|\bcomic[\s-]?con\b|\bkcon\b|\banime expo\b|\bexpo\b/.test(t)) {
    return 'Convention';
  }
  if (/\bfestival\b|\bfest\b|\bmusic fest\b/.test(t)) return 'Festival';
  if (/\bcommunity\b|\bmeetup\b|\bfan club\b|\bcafé event\b|\bcafe event\b/.test(t)) {
    return 'Community Event';
  }
  if (/\blocal\b|\bworkshop\b|\bclass\b|\bmarket\b/.test(t)) return 'Local Event';
  if (/\bconcert\b|\btour\b|\blive\b|\bworld tour\b|\bshowcase\b|\bperformance\b/.test(t)) {
    return 'Concert';
  }
  return 'Concert';
}

export function isValidPulseEventType(value: string): value is PulseEventType {
  return (PULSE_EVENT_TYPES as readonly string[]).includes(value);
}

export function looksKpopRelated(text: string, knownActKeys: Set<string>): boolean {
  const lower = text.toLowerCase();
  if (/\bk-?pop\b|\bkorean\s+pop\b|\bkcon\b/.test(lower)) return true;
  const key = normalizeKeyPart(text);
  if (knownActKeys.has(key)) return true;
  for (const known of knownActKeys) {
    if (known.length >= 3 && (key.includes(known) || known.includes(key))) return true;
  }
  return false;
}

export async function loadKnownActs(): Promise<{
  knownActKeys: Set<string>;
  groupQueryList: string[];
}> {
  const knownActKeys = new Set<string>();
  const groupCounts = new Map<string, number>();

  for (const act of PRIORITY_ACTS) {
    knownActKeys.add(normalizeKeyPart(act));
    groupCounts.set(act, (groupCounts.get(act) || 0) + 1000);
  }

  if (existsSync(BIRTHDAYS_JSON_PATH)) {
    try {
      const raw = JSON.parse(await readFile(BIRTHDAYS_JSON_PATH, 'utf8')) as BirthdayCatalogEntry[];
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          const name = (entry.name || '').trim();
          const group = (entry.group || '').trim();
          if (name) knownActKeys.add(normalizeKeyPart(name));
          if (group) {
            knownActKeys.add(normalizeKeyPart(group));
            groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
          }
        }
      }
    } catch {
      // birthdays.json optional for act boosting
    }
  }

  const groupQueryList = [...groupCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name)
    .filter((name) => normalizeKeyPart(name).length >= 2)
    .slice(0, 100);

  return { knownActKeys, groupQueryList };
}

function richness(e: PulseEvent): number {
  return (
    (e.image ? 2 : 0) +
    (e.shortDescription ? 2 : 0) +
    (e.artist ? 1 : 0) +
    (e.sourceUrl ? 1 : 0)
  );
}

function softKey(e: PulseEvent): string {
  return [normalizeKeyPart(e.title), normalizeKeyPart(e.sourceUrl || '')].join('|');
}

export function dedupeEvents(events: PulseEvent[]): PulseEvent[] {
  const byId = new Map<string, PulseEvent>();
  const bySoft = new Map<string, PulseEvent>();

  for (const event of events) {
    const existingId = byId.get(event.id);
    if (existingId) {
      const richer = richness(event) > richness(existingId) ? event : existingId;
      byId.set(richer.id, richer);
      bySoft.set(softKey(richer), richer);
      continue;
    }

    const soft = softKey(event);
    const existingSoft = bySoft.get(soft);
    if (existingSoft) {
      const richer = richness(event) > richness(existingSoft) ? event : existingSoft;
      byId.delete(existingSoft.id);
      byId.set(richer.id, richer);
      bySoft.set(soft, richer);
      continue;
    }

    byId.set(event.id, event);
    bySoft.set(soft, event);
  }

  return [...byId.values()];
}

export function catalogFingerprint(events: PulseEvent[]): string {
  const normalized = [...events]
    .map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      artist: e.artist,
      group: e.group,
      date: e.date,
      time: e.time,
      venue: e.venue,
      city: e.city,
      country: e.country,
      latitude: e.latitude,
      longitude: e.longitude,
      image: e.image,
      shortDescription: e.shortDescription,
      sourceUrl: e.sourceUrl,
      ticketUrl: e.ticketUrl,
      source: e.source,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
