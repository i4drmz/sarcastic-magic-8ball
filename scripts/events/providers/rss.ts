/**
 * Free public RSS feeds → structured Pulse events.
 * No API keys. Feed provenance stays in pipeline logs only.
 */

import {
  articleToEvent,
  getActDictionaries,
  isEventAnnouncementHeadline,
  type DiscardReason,
} from '../extractEvent';
import { RSS_FEEDS } from '../feeds';
import { fetchText } from '../http';
import { looksLikeRss, parseFeedXml } from '../parseRss';
import { resolveArticleImage } from '../resolveImage';
import type { EventProvider, ProviderContext, ProviderResult, PulseEvent } from '../types';

export interface FeedRunStat {
  id: string;
  label: string;
  url: string;
  ok: boolean;
  httpStatus: number;
  items: number;
  eventRelated: number;
  extracted: number;
  discarded: number;
  discardReasons: Partial<Record<DiscardReason, number>>;
  error?: string;
}

export interface RssProviderExtras {
  feedStats: FeedRunStat[];
}

function bump(map: Partial<Record<DiscardReason, number>>, reason: DiscardReason): void {
  map[reason] = (map[reason] || 0) + 1;
}

export const rssProvider: EventProvider = {
  id: 'rss',
  name: 'Public RSS feeds',
  isEnabled() {
    return true;
  },
  async fetch(ctx: ProviderContext): Promise<ProviderResult> {
    const notes: string[] = [];
    let apiRequests = 0;
    const events: PulseEvent[] = [];
    const seenUrls = new Set<string>();
    const feedStats: FeedRunStat[] = [];

    const { knownActKeys, displayNames } = await getActDictionaries();

    for (const feed of RSS_FEEDS) {
      const stat: FeedRunStat = {
        id: feed.id,
        label: feed.label,
        url: feed.url,
        ok: false,
        httpStatus: 0,
        items: 0,
        eventRelated: 0,
        extracted: 0,
        discarded: 0,
        discardReasons: {},
      };

      try {
        const res = await fetchText(feed.url, {
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
          gapMs: 400,
        });
        apiRequests += 1;
        stat.httpStatus = res.status;

        if (!res.ok) {
          stat.error = `HTTP ${res.status}`;
          notes.push(`${feed.id}: HTTP ${res.status}`);
          feedStats.push(stat);
          continue;
        }

        if (!looksLikeRss(res.text)) {
          stat.error = 'response is not RSS/Atom XML';
          notes.push(`${feed.id}: not RSS/Atom`);
          feedStats.push(stat);
          continue;
        }

        const items = parseFeedXml(res.text);
        stat.ok = true;
        stat.items = items.length;
        ctx.log(`${feed.id}: ${items.length} items`);

        for (const item of items) {
          if (isEventAnnouncementHeadline(item.title)) stat.eventRelated += 1;

          if (seenUrls.has(item.link)) {
            continue;
          }

          const { event, discardReason } = articleToEvent(
            {
              title: item.title,
              description: item.description,
              content: item.content,
              url: item.link,
              image: item.image,
              publishedAt: item.publishedAt,
            },
            {
              source: `rss:${feed.id}`,
              lastUpdated: ctx.lastUpdated,
              today: ctx.today,
              knownActKeys,
              displayNames,
              kpopDedicated: feed.kpopDedicated,
            },
          );

          if (!event || discardReason) {
            stat.discarded += 1;
            if (discardReason) bump(stat.discardReasons, discardReason);
            continue;
          }

          seenUrls.add(item.link);
          events.push(event);
          stat.extracted += 1;
        }
      } catch (error) {
        apiRequests += 1;
        stat.error = error instanceof Error ? error.message : String(error);
        notes.push(`${feed.id}: ${stat.error}`);
      }

      feedStats.push(stat);
      notes.push(
        `${feed.id}: items=${stat.items} related=${stat.eventRelated} extracted=${stat.extracted} discarded=${stat.discarded}`,
      );
    }

    // Many feeds omit images — pull Open Graph images from article pages.
    let imagesResolved = 0;
    for (const event of events) {
      if (event.image) continue;
      if (!event.sourceUrl) continue;
      const image = await resolveArticleImage(event.sourceUrl, 180);
      apiRequests += 1;
      if (image) {
        event.image = image;
        imagesResolved += 1;
      }
    }
    notes.push(`images resolved from articles=${imagesResolved}/${events.length}`);

    const okFeeds = feedStats.filter((f) => f.ok).length;
    ctx.log(`feeds ok=${okFeeds}/${feedStats.length} events=${events.length} images=${imagesResolved}`);

    return {
      providerId: 'rss',
      events,
      apiRequests,
      notes,
      extras: { feedStats } satisfies RssProviderExtras,
    };
  },
};
