/**
 * Turn an RSS item into an Event Discovery card.
 * Keep announcement/promotion items even when venue/city/date are missing.
 * Interviews, reviews, recaps, galleries, and opinion pieces are excluded.
 */

import type { PulseEvent } from '../../src/models/pulseEvent';
import {
  classifyEventType,
  loadKnownActs,
  normalizeKeyPart,
  PRIORITY_ACTS,
  stableHash,
  todayUtcDateString,
} from './utils';

export interface RssArticleInput {
  title: string;
  description?: string | null;
  content?: string | null;
  url: string;
  image?: string | null;
  publishedAt?: string | null;
}

export type DiscardReason =
  | 'no_event_signal'
  | 'missing_title_or_url'
  | 'not_event_announcement';

/** Strong event nouns / ticket language — enough on their own. */
const HEADLINE_EVENT_NOUN =
  /\b(concerts?|world\s*tour|\btours?\b|fan\s*concert|fan\s*meeting|fanmeeting|fansign|fan\s*sign|showcase|\blive\b|festivals?|pop[\s-]?ups?|exhibitions?|tickets?)\b/i;

/**
 * Soft promotion verbs — only count when the headline also has an event noun
 * (avoids “announces hiatus / fan club / solo debut” false positives).
 */
const HEADLINE_PROMO_VERB =
  /\b(announces|announced|coming\s+to|returns\s+to)\b/i;

/** Headline matches → never treat as an event card (news-style coverage). */
const HEADLINE_EXCLUDE =
  /\b(interview|review|recap|photos?|gallery|reaction|opinion|rankings?|charts?|sales|streaming|teaser|\bMV\b|music\s+video|behind\s+the\s+scenes|playlist|confessionals?|hiatus|fan\s+club|solo\s+debut|grammy\s+submission|premiere\s+date|on\s+set\s+of)\b/i;

/** Extra non-announcement headlines (obituaries, earnings, etc.). */
const HEADLINE_HARD_EXCLUDE =
  /\b(\bdies\b|\bdied\b|passed\s+away|obituary|what every music company made|q[1-4]\s+20\d{2}\s+earnings)\b/i;

const STOP_ACT_KEYS = new Set([
  'new',
  'if',
  'the',
  'and',
  'for',
  'you',
  'me',
  'my',
  'to',
  'on',
  'in',
  'at',
  'live',
  'show',
  'tour',
  'concert',
  'festival',
  'pop',
  'day',
  'one',
  'two',
  '100',
  'saturday',
  'sunday',
  'highlight',
  'windy city',
  'rachel',
  'arie',
  'chocolat',
  'astro',
]);

function textMentionsAct(normalizedText: string, key: string): boolean {
  if (key.length <= 4) {
    return ` ${normalizedText} `.includes(` ${key} `);
  }
  return normalizedText.includes(key);
}

function matchArtist(
  text: string,
  knownActKeys: Set<string>,
  displayNames: Map<string, string>,
): string | null {
  const normalized = normalizeKeyPart(text);
  const keys = [...knownActKeys].sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (key.length < 2) continue;
    if (textMentionsAct(normalized, key)) {
      return displayNames.get(key) || key;
    }
  }
  return null;
}

function cleanHeadline(raw: string): string {
  let title = raw
    .replace(
      /\s*[\-|–|—|:]\s*(Soompi|Allkpop|allkpop|Koreaboo|Billboard|NME|Rolling Stone|helloKpop|The Bias List|Variety|Forbes).*$/i,
      '',
    )
    .replace(/\b(exclusive|breaking|update)\b[:\s-]*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (title.length > 140) title = `${title.slice(0, 137).trim()}…`;
  return title || raw.trim();
}

function cleanShortSummary(text: string): string | null {
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\b(according to|the article|this report|read more|continue reading)\b/gi, '')
    .replace(/\s*The post\b[\s\S]*$/i, '')
    .replace(/\s*appeared first on\b[\s\S]*$/i, '')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length <= 240) return cleaned;
  return `${cleaned.slice(0, 237).trim()}…`;
}

function headlineHasEventInclude(headline: string): boolean {
  if (HEADLINE_EVENT_NOUN.test(headline)) return true;
  // “announces … tour/concert/…” etc.
  return HEADLINE_PROMO_VERB.test(headline) && HEADLINE_EVENT_NOUN.test(headline);
}

/**
 * True when the headline looks like an event announcement/promotion
 * (include terms present, exclude terms absent).
 */
export function isEventAnnouncementHeadline(headline: string): boolean {
  const h = headline.trim();
  if (!h) return false;
  if (HEADLINE_EXCLUDE.test(h) || HEADLINE_HARD_EXCLUDE.test(h)) return false;
  return headlineHasEventInclude(h);
}

/** @deprecated Use isEventAnnouncementHeadline — kept for provider stats. */
export function hasEventSignal(text: string): boolean {
  return isEventAnnouncementHeadline(text);
}

export async function getActDictionaries(): Promise<{
  knownActKeys: Set<string>;
  displayNames: Map<string, string>;
}> {
  const { groupQueryList } = await loadKnownActs();
  const knownActKeys = new Set<string>();
  const displayNames = new Map<string, string>();

  for (const name of [...PRIORITY_ACTS, ...groupQueryList]) {
    const key = normalizeKeyPart(name);
    if (key.length < 3 || STOP_ACT_KEYS.has(key) || /^\d+$/.test(key)) continue;
    knownActKeys.add(key);
    if (!displayNames.has(key)) displayNames.set(key, name);
  }

  return { knownActKeys, displayNames };
}

/**
 * Build a discovery card from an RSS item.
 * Inclusion is driven by the headline (announce/promote vs news-style coverage).
 */
export function articleToEvent(
  article: RssArticleInput,
  opts: {
    source: string;
    lastUpdated: string;
    today: string;
    knownActKeys: Set<string>;
    displayNames: Map<string, string>;
  },
): { event: PulseEvent | null; discardReason: DiscardReason | null } {
  const titleRaw = (article.title || '').trim();
  const description = (article.description || '').trim();
  const content = (article.content || '').trim();
  const blob = `${titleRaw}\n${description}\n${content}`;

  if (!titleRaw || !article.url) {
    return { event: null, discardReason: 'missing_title_or_url' };
  }

  // Excludes win over includes (interview about a tour, photo gallery of a festival, etc.)
  if (HEADLINE_EXCLUDE.test(titleRaw) || HEADLINE_HARD_EXCLUDE.test(titleRaw)) {
    return { event: null, discardReason: 'not_event_announcement' };
  }
  if (!headlineHasEventInclude(titleRaw)) {
    return { event: null, discardReason: 'no_event_signal' };
  }

  const artist = matchArtist(blob, opts.knownActKeys, opts.displayNames);
  const headline = cleanHeadline(titleRaw);
  const shortDescription = cleanShortSummary(description || content || headline);
  const publishedDate = article.publishedAt?.slice(0, 10) || opts.today;
  const id = `evt-${stableHash(`${normalizeKeyPart(headline)}|${article.url}`)}`;

  return {
    event: {
      id,
      type: classifyEventType(blob),
      title: headline,
      artist,
      group: artist,
      // Soft field for ordering only — never required for inclusion
      date: publishedDate && publishedDate.length === 10 ? publishedDate : todayUtcDateString(),
      time: null,
      venue: 'TBA',
      city: 'TBA',
      country: 'XX',
      latitude: null,
      longitude: null,
      image: article.image?.trim() || null,
      shortDescription,
      sourceUrl: article.url,
      ticketUrl: null,
      source: opts.source,
      lastUpdated: opts.lastUpdated,
    },
    discardReason: null,
  };
}
