# Pulse events pipeline — Event Discovery (RSS)

## Goal

Keep `data/events.json` as an **Event Discovery feed** updated every **6 hours** from
**free public RSS feeds** only. No Ticketmaster. No API-key news services.

This is **not** a perfectly structured event database. Matching items become cards even when
venue, city, country, coordinates, or exact event dates are missing.

RSS is backend-only. The app must never show publishers, website names, “news”, “article”, or “RSS”.

## Architecture

```
scripts/updateEvents.ts              ← orchestrator (dedupe, publish)
scripts/events/feeds.ts              ← RSS feed registry
scripts/events/parseRss.ts           ← RSS/Atom parser
scripts/events/extractEvent.ts       ← item → discovery card
scripts/events/providers/rss.ts      ← download + extract
scripts/publishEventData.ts          ← commit/push only when fingerprint changes
```

## Technical report (latest run)

- **Ran at:** 2026-08-04T22:41:35.332Z
- **Feeds attempted:** 12
- **Feeds successful:** 12
- **Feeds failed:** 0
- **Total RSS items:** 243
- **Event-related items:** 9
- **Discovery cards extracted:** 8
- **Items discarded (non-matching only):** 234
- **After dedupe:** 8
- **Written to events.json:** 8
- **Coverage of event-related items:** 88.9% of event-related items became discovery cards

### Per-feed results

| Feed | Status | Items | Event-related | Extracted | Discarded |
|------|--------|------:|--------------:|----------:|----------:|
| Soompi (`soompi`) | OK | 60 | 1 | 1 | 59 |
| Soompi Music (`soompi-music`) | OK | 60 | 7 | 6 | 53 |
| allkpop Lab (`allkpop`) | OK | 40 | 1 | 1 | 39 |
| Koreaboo (`koreaboo`) | OK | 10 | 0 | 0 | 10 |
| Billboard (`billboard`) | OK | 10 | 0 | 0 | 10 |
| Billboard Music (`billboard-music`) | OK | 10 | 0 | 0 | 10 |
| NME (`nme`) | OK | 10 | 0 | 0 | 10 |
| NME Music (`nme-music`) | OK | 10 | 0 | 0 | 10 |
| Rolling Stone (`rollingstone`) | OK | 10 | 0 | 0 | 10 |
| Rolling Stone Music News (`rollingstone-music`) | OK | 10 | 0 | 0 | 10 |
| helloKpop (`hellokpop`) | OK | 3 | 0 | 0 | 3 |
| The Bias List (`biaslist`) | OK | 10 | 0 | 0 | 10 |

### Discard reasons

Only non-matching items are discarded (no event keywords, or missing title/URL).
Missing venue / city / date is **not** a discard reason.

| Reason | Count |
|--------|------:|
| no_event_signal | 164 |
| not_event_announcement | 70 |

## Card fields

Displayed: `title` (headline), `shortDescription`, `image`
Optional: `artist`
Internal only: `sourceUrl`

**Find Tickets** opens Google: `"<headline> tickets"` or `"<artist> <headline> tickets"`.

## Schedule

- Workflow: `.github/workflows/update-events.yml`
- Cron: **`0 */6 * * *`** UTC (+ `workflow_dispatch`)
- **No API secrets required**

## Limitations

1. Cards reflect announcements/coverage, not verified ticket inventories.
2. Artist matching is best-effort; many cards have `artist: null`.
3. Soft `date` is usually the publish day (for ordering), not a confirmed event day.
4. Failed feeds are skipped if at least one feed succeeds.

## Commands

```bash
PULSE_SKIP_PUBLISH=1 npm run update:events   # local write
npm run update:events                        # sync + publish-if-changed
```
