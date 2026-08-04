/**
 * Fully automatic Pulse events sync → data/events.json
 *
 * Free public RSS feeds only (no Ticketmaster, no API keys).
 * Event Discovery feed: keep all event-related RSS items as cards
 * (headline / artist / image / summary). Missing venue/date/city is fine.
 * The mobile app never surfaces feed/publisher provenance.
 *
 * Env:
 *   PULSE_SKIP_PUBLISH=1   skip git commit/push
 *   EXPO_PUBLIC_PULSE_DATA_BASE_URL / PULSE_GITHUB_BRANCH for verify
 *
 * Run: npm run update:events
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PulseEventCatalog } from '../src/models/pulseEvent';
import { getEnabledProviders, EVENT_PROVIDERS } from './events/providers';
import type { FeedRunStat, RssProviderExtras } from './events/providers/rss';
import type { ProviderResult } from './events/types';
import { catalogFingerprint, dedupeEvents, todayUtcDateString } from './events/utils';
import { getPulseDataBaseUrl } from './pulseDataUrl';
import { publishEventData } from './publishEventData';

const ROOT = process.cwd();
const OUTPUT_JSON_PATH = path.join(ROOT, 'data', 'events.json');
const LOG_JSON_PATH = path.join(ROOT, 'data', 'event-pipeline-log.json');
const REPORT_MD_PATH = path.join(ROOT, 'docs', 'EVENTS_PIPELINE.md');

interface PipelineLog {
  ranAt: string;
  success: boolean;
  apiRequests: number;
  providersRegistered: string[];
  providersEnabled: string[];
  providersSkipped: { id: string; reason: string }[];
  providersSucceeded: string[];
  providersFailed: { id: string; error: string }[];
  feedStats: FeedRunStat[];
  rawEvents: number;
  afterDedupe: number;
  afterUpcomingFilter: number;
  totalItems: number;
  totalEventRelated: number;
  totalExtracted: number;
  totalDiscarded: number;
  extractionAccuracyPct: number | null;
  previousCount: number;
  writtenCount: number;
  changed: boolean;
  published: boolean;
  notes: string[];
}

function log(message: string): void {
  console.log(`[updateEvents] ${message}`);
}

async function loadPrevious(): Promise<PulseEventCatalog | null> {
  if (!existsSync(OUTPUT_JSON_PATH)) return null;
  try {
    return JSON.parse(await readFile(OUTPUT_JSON_PATH, 'utf8')) as PulseEventCatalog;
  } catch {
    return null;
  }
}

function collectFeedStats(results: ProviderResult[]): FeedRunStat[] {
  const stats: FeedRunStat[] = [];
  for (const result of results) {
    const extras = result.extras as RssProviderExtras | undefined;
    if (extras?.feedStats?.length) stats.push(...extras.feedStats);
  }
  return stats;
}

function writeTechnicalReport(pipelineLog: PipelineLog): string {
  const okFeeds = pipelineLog.feedStats.filter((f) => f.ok);
  const failedFeeds = pipelineLog.feedStats.filter((f) => !f.ok);

  const feedRows = pipelineLog.feedStats
    .map((f) => {
      const status = f.ok ? 'OK' : `FAIL (${f.error || `HTTP ${f.httpStatus}`})`;
      return `| ${f.label} (\`${f.id}\`) | ${status} | ${f.items} | ${f.eventRelated} | ${f.extracted} | ${f.discarded} |`;
    })
    .join('\n');

  const discardTotals: Record<string, number> = {};
  for (const f of pipelineLog.feedStats) {
    for (const [reason, count] of Object.entries(f.discardReasons || {})) {
      discardTotals[reason] = (discardTotals[reason] || 0) + (count || 0);
    }
  }
  const discardRows = Object.entries(discardTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `| ${reason} | ${count} |`)
    .join('\n');

  const accuracy =
    pipelineLog.extractionAccuracyPct == null
      ? 'n/a'
      : `${pipelineLog.extractionAccuracyPct}% of event-related items became discovery cards`;

  return `# Pulse events pipeline — Event Discovery (RSS)

## Goal

Keep \`data/events.json\` as an **Event Discovery feed** updated every **6 hours** from
**free public RSS feeds** only. No Ticketmaster. No API-key news services.

This is **not** a perfectly structured event database. Matching items become cards even when
venue, city, country, coordinates, or exact event dates are missing.

RSS is backend-only. The app must never show publishers, website names, “news”, “article”, or “RSS”.

## Architecture

\`\`\`
scripts/updateEvents.ts              ← orchestrator (dedupe, publish)
scripts/events/feeds.ts              ← RSS feed registry
scripts/events/parseRss.ts           ← RSS/Atom parser
scripts/events/extractEvent.ts       ← item → discovery card
scripts/events/providers/rss.ts      ← download + extract
scripts/publishEventData.ts          ← commit/push only when fingerprint changes
\`\`\`

## Technical report (latest run)

- **Ran at:** ${pipelineLog.ranAt}
- **Feeds attempted:** ${pipelineLog.feedStats.length}
- **Feeds successful:** ${okFeeds.length}
- **Feeds failed:** ${failedFeeds.length}
- **Total RSS items:** ${pipelineLog.totalItems}
- **Event-related items:** ${pipelineLog.totalEventRelated}
- **Discovery cards extracted:** ${pipelineLog.totalExtracted}
- **Items discarded (non-matching only):** ${pipelineLog.totalDiscarded}
- **After dedupe:** ${pipelineLog.afterDedupe}
- **Written to events.json:** ${pipelineLog.writtenCount}
- **Coverage of event-related items:** ${accuracy}

### Per-feed results

| Feed | Status | Items | Event-related | Extracted | Discarded |
|------|--------|------:|--------------:|----------:|----------:|
${feedRows || '| _(no feed stats)_ | | | | | |'}

### Discard reasons

Only non-matching items are discarded (no event keywords, or missing title/URL).
Missing venue / city / date is **not** a discard reason.

| Reason | Count |
|--------|------:|
${discardRows || '| _(none)_ | 0 |'}

## Card fields

Displayed: \`title\` (headline), \`shortDescription\`, \`image\`
Optional: \`artist\`
Internal only: \`sourceUrl\`

**Find Tickets** opens Google: \`"<headline> tickets"\` or \`"<artist> <headline> tickets"\`.

## Schedule

- Workflow: \`.github/workflows/update-events.yml\`
- Cron: **\`0 */6 * * *\`** UTC (+ \`workflow_dispatch\`)
- **No API secrets required**

## Limitations

1. Cards reflect announcements/coverage, not verified ticket inventories.
2. Artist matching is best-effort; many cards have \`artist: null\`.
3. Soft \`date\` is usually the publish day (for ordering), not a confirmed event day.
4. Failed feeds are skipped if at least one feed succeeds.

## Commands

\`\`\`bash
PULSE_SKIP_PUBLISH=1 npm run update:events   # local write
npm run update:events                        # sync + publish-if-changed
\`\`\`
`;
}

async function main(): Promise<void> {
  const ranAt = new Date().toISOString();
  const today = todayUtcDateString();
  const previous = await loadPrevious();
  const previousCount = previous?.events?.length ?? 0;

  const pipelineLog: PipelineLog = {
    ranAt,
    success: false,
    apiRequests: 0,
    providersRegistered: EVENT_PROVIDERS.map((p) => p.id),
    providersEnabled: [],
    providersSkipped: [],
    providersSucceeded: [],
    providersFailed: [],
    feedStats: [],
    rawEvents: 0,
    afterDedupe: 0,
    afterUpcomingFilter: 0,
    totalItems: 0,
    totalEventRelated: 0,
    totalExtracted: 0,
    totalDiscarded: 0,
    extractionAccuracyPct: null,
    previousCount,
    writtenCount: 0,
    changed: false,
    published: false,
    notes: [],
  };

  const enabled = getEnabledProviders();
  pipelineLog.providersEnabled = enabled.map((p) => p.id);

  if (!enabled.length) {
    const msg = 'No event providers enabled.';
    log(msg);
    pipelineLog.notes.push(msg);
    await mkdir(path.dirname(LOG_JSON_PATH), { recursive: true });
    await writeFile(LOG_JSON_PATH, `${JSON.stringify(pipelineLog, null, 2)}\n`, 'utf8');
    throw new Error(msg);
  }

  const results: ProviderResult[] = [];

  for (const provider of enabled) {
    log(`Fetching ${provider.name}…`);
    try {
      const result = await provider.fetch({
        lastUpdated: ranAt,
        today,
        log: (m) => log(`[${provider.id}] ${m}`),
      });
      results.push(result);
      pipelineLog.apiRequests += result.apiRequests;
      pipelineLog.notes.push(...result.notes.map((n) => `${provider.id}:${n}`));

      if (result.skipped) {
        pipelineLog.providersSkipped.push({
          id: provider.id,
          reason: result.skipReason || 'skipped',
        });
        log(`Skip ${provider.id} — ${result.skipReason || 'skipped'}`);
      } else {
        pipelineLog.providersSucceeded.push(provider.id);
        pipelineLog.rawEvents += result.events.length;
        log(`${provider.id} → ${result.events.length} events (${result.apiRequests} requests)`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      pipelineLog.providersFailed.push({ id: provider.id, error: msg });
      log(`Provider ${provider.id} failed (continuing): ${msg}`);
    }
  }

  pipelineLog.feedStats = collectFeedStats(results);
  pipelineLog.totalItems = pipelineLog.feedStats.reduce((s, f) => s + f.items, 0);
  pipelineLog.totalEventRelated = pipelineLog.feedStats.reduce((s, f) => s + f.eventRelated, 0);
  pipelineLog.totalExtracted = pipelineLog.feedStats.reduce((s, f) => s + f.extracted, 0);
  pipelineLog.totalDiscarded = pipelineLog.feedStats.reduce((s, f) => s + f.discarded, 0);
  pipelineLog.extractionAccuracyPct =
    pipelineLog.totalEventRelated > 0
      ? Math.round((pipelineLog.totalExtracted / pipelineLog.totalEventRelated) * 1000) / 10
      : null;

  const anyFeedOk = pipelineLog.feedStats.some((f) => f.ok);
  if (!pipelineLog.providersSucceeded.length || !anyFeedOk) {
    pipelineLog.notes.push('All RSS feeds failed — retaining previous catalog');
    await writeFile(LOG_JSON_PATH, `${JSON.stringify(pipelineLog, null, 2)}\n`, 'utf8');
    await writeFile(REPORT_MD_PATH, writeTechnicalReport(pipelineLog), 'utf8');
    if (previous?.events?.length) {
      throw new Error('Event sync failed: no successful RSS feeds (kept previous catalog)');
    }
    throw new Error('Event sync failed: no successful RSS feeds');
  }

  const merged = results.flatMap((r) => r.events);
  const deduped = dedupeEvents(merged);
  pipelineLog.afterDedupe = deduped.length;

  // Discovery feed: keep all matching cards; newest announcements first
  const feed = deduped.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.title.localeCompare(b.title),
  );
  pipelineLog.afterUpcomingFilter = feed.length;

  const catalog: PulseEventCatalog = {
    generatedAt: ranAt,
    lastUpdated: ranAt,
    sourceSummary: pipelineLog.feedStats.filter((f) => f.ok && f.extracted > 0).map((f) => f.id),
    events: feed,
  };

  const prevFp = previous ? catalogFingerprint(previous.events) : '';
  const nextFp = catalogFingerprint(catalog.events);
  const changed = prevFp !== nextFp;
  pipelineLog.changed = changed;
  pipelineLog.writtenCount = feed.length;

  await mkdir(path.dirname(OUTPUT_JSON_PATH), { recursive: true });
  await writeFile(OUTPUT_JSON_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await writeFile(LOG_JSON_PATH, `${JSON.stringify(pipelineLog, null, 2)}\n`, 'utf8');
  await writeFile(REPORT_MD_PATH, writeTechnicalReport(pipelineLog), 'utf8');

  log(
    `Wrote ${feed.length} discovery cards (prev=${previousCount}, changed=${changed}, feeds=${pipelineLog.feedStats.filter((f) => f.ok).length}/${pipelineLog.feedStats.length}, coverage=${pipelineLog.extractionAccuracyPct ?? 'n/a'}%)`,
  );
  try {
    log(`Hosting base: ${getPulseDataBaseUrl()}`);
  } catch {
    log('Hosting base unset (ok for local dry-run)');
  }

  if (!changed) {
    log('No data change — skipping publish');
    pipelineLog.success = true;
    await writeFile(LOG_JSON_PATH, `${JSON.stringify(pipelineLog, null, 2)}\n`, 'utf8');
    await writeFile(REPORT_MD_PATH, writeTechnicalReport(pipelineLog), 'utf8');
    return;
  }

  if (process.env.PULSE_SKIP_PUBLISH === '1') {
    log('PULSE_SKIP_PUBLISH=1 — local write only');
    pipelineLog.success = true;
    await writeFile(LOG_JSON_PATH, `${JSON.stringify(pipelineLog, null, 2)}\n`, 'utf8');
    await writeFile(REPORT_MD_PATH, writeTechnicalReport(pipelineLog), 'utf8');
    return;
  }

  const published = await publishEventData();
  pipelineLog.published = published;
  pipelineLog.success = true;
  await writeFile(LOG_JSON_PATH, `${JSON.stringify(pipelineLog, null, 2)}\n`, 'utf8');
  await writeFile(REPORT_MD_PATH, writeTechnicalReport(pipelineLog), 'utf8');
  log(published ? 'Published events.json' : 'Publish no-op');
}

main().catch((error) => {
  console.error('[updateEvents] FATAL', error);
  process.exitCode = 1;
});
