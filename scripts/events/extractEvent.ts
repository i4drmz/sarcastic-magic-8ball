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
  | 'not_event_announcement'
  | 'not_kpop';

/**
 * Explicit K-pop wording. Items from general music feeds must match this or a
 * known K-pop act — otherwise Western tours/musicals leak into the feed.
 */
const KPOP_SIGNAL = /\bk[\s-]?pop\b|\bkpop\b|\bkorean\b|\bkorea\b|\bseoul\b|\bk-?drama\b/i;

/** Strong event nouns / ticket language — must pair with a promo verb. */
const HEADLINE_EVENT_NOUN =
  /\b(concerts?|world\s*tour|\btours?\b|fan\s*concert|fan\s*meeting|fanmeeting|fansign|fan\s*sign|showcase|\blive\b|festivals?|pop[\s-]?ups?|exhibitions?|tickets?)\b/i;

/**
 * Announcement / upcoming-event verbs. Event nouns alone are not enough
 * (that lets past-performance recaps like “electrify … festivals” through).
 */
const HEADLINE_PROMO_VERB =
  /\b(announces?|announced|announcing|coming\s+to|returns?\s+to|returning\s+to|to\s+hold|will\s+hold|set\s+to|unveils?|unveiled|reveals?|revealed|schedules?|scheduled|confirms?|confirmed|adds?\s+dates?|tickets?\s+on\s+sale)\b/i;

/** Headline matches → never treat as an event card (news-style coverage). */
const HEADLINE_EXCLUDE =
  /\b(interview|review|recap|photos?|gallery|reaction|opinion|rankings?|charts?|sales|streaming|teaser|\bMV\b|music\s+video|behind\s+the\s+scenes|playlist|confessionals?|hiatus|fan\s+club|solo\s+debut|grammy\s+submission|premiere\s+date|on\s+set\s+of|cancell?ed|cancels|postponed?|sits?\s+out|pulls?\s+out|drops?\s+out|due\s+to\s+illness|completes?|completed|concludes?|wrap(?:s|ped)?\s+up|electrif\w*|showcase[ds]?|took\s+the\s+stage|hit\s+the\s+stage|performed\s+at|drawing\s+(?:a\s+)?combined|\bfans\s+at\b|\bidea\b|\bconcept\b|marked\s+their|celebrates?\s+\d|celebrate\s+\d)\b/i;

/** Extra non-announcement headlines (obituaries, earnings, listicles, etc.). */
const HEADLINE_HARD_EXCLUDE =
  /\b(\bdies\b|\bdied\b|passed\s+away|obituary|what every music company made|q[1-4]\s+20\d{2}\s+earnings)\b|^\s*every\s|\((so\s+far|updating)\)/i;

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

/**
 * Act names that are also everyday English words — only count them when the
 * text has explicit K-pop context (else “seventeen albums” → SEVENTEEN).
 */
const AMBIGUOUS_ACT_KEYS = new Set([
  'seventeen',
  'twice',
  'once',
  'april',
  'may',
  'winner',
  'lucy',
  'monsta',
  'boys',
  'girls',
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
  const hasKpopContext = KPOP_SIGNAL.test(text);
  const keys = [...knownActKeys].sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (key.length < 2) continue;
    if (AMBIGUOUS_ACT_KEYS.has(key) && !hasKpopContext) continue;
    if (textMentionsAct(normalized, key)) {
      return displayNames.get(key) || key;
    }
  }
  return null;
}

/** Quoted tour/show name in the headline, e.g. Tour "BEYOND". */
function extractQuotedName(headline: string): string | null {
  const m = headline.match(/["“'‘]([^"”'’]{2,40})["”'’]/);
  return m ? m[1].trim() : null;
}

const TYPE_PHRASE_RE =
  /\b((?:world|asian?|europe(?:an)?|north\s+american|nationwide|anniversary|solo|encore|debut|first)\s+)?(world\s+tour|tour|fan\s+concert|fan\s+meeting|fanmeeting|fan\s*sign|showcase|festival|concert|pop[\s-]?up|exhibition)\b/i;

function titleCaseWords(s: string): string {
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** Event phrase from the headline, e.g. “Asia Tour”, “Fan Concert”. */
function extractTypePhrase(headline: string): string | null {
  const m = headline.match(TYPE_PHRASE_RE);
  if (!m) return null;
  const phrase = `${m[1] ? `${m[1].trim()} ` : ''}${m[2].trim()}`.replace(/\s+/g, ' ');
  return titleCaseWords(phrase);
}

/** Cities/countries commonly named in K-pop event announcements. */
const KNOWN_PLACES: Array<{ key: string; city: string | null; country: string }> = [
  { key: 'seoul', city: 'Seoul', country: 'KR' },
  { key: 'busan', city: 'Busan', country: 'KR' },
  { key: 'incheon', city: 'Incheon', country: 'KR' },
  { key: 'daegu', city: 'Daegu', country: 'KR' },
  { key: 'tokyo', city: 'Tokyo', country: 'JP' },
  { key: 'osaka', city: 'Osaka', country: 'JP' },
  { key: 'nagoya', city: 'Nagoya', country: 'JP' },
  { key: 'fukuoka', city: 'Fukuoka', country: 'JP' },
  { key: 'yokohama', city: 'Yokohama', country: 'JP' },
  { key: 'macau', city: 'Macau', country: 'MO' },
  { key: 'hong kong', city: 'Hong Kong', country: 'HK' },
  { key: 'taipei', city: 'Taipei', country: 'TW' },
  { key: 'bangkok', city: 'Bangkok', country: 'TH' },
  { key: 'singapore', city: 'Singapore', country: 'SG' },
  { key: 'manila', city: 'Manila', country: 'PH' },
  { key: 'jakarta', city: 'Jakarta', country: 'ID' },
  { key: 'kuala lumpur', city: 'Kuala Lumpur', country: 'MY' },
  { key: 'london', city: 'London', country: 'GB' },
  { key: 'paris', city: 'Paris', country: 'FR' },
  { key: 'berlin', city: 'Berlin', country: 'DE' },
  { key: 'amsterdam', city: 'Amsterdam', country: 'NL' },
  { key: 'los angeles', city: 'Los Angeles', country: 'US' },
  { key: 'new york', city: 'New York', country: 'US' },
  { key: 'chicago', city: 'Chicago', country: 'US' },
  { key: 'atlanta', city: 'Atlanta', country: 'US' },
  { key: 'dallas', city: 'Dallas', country: 'US' },
  { key: 'houston', city: 'Houston', country: 'US' },
  { key: 'seattle', city: 'Seattle', country: 'US' },
  { key: 'san francisco', city: 'San Francisco', country: 'US' },
  { key: 'oakland', city: 'Oakland', country: 'US' },
  { key: 'newark', city: 'Newark', country: 'US' },
  { key: 'toronto', city: 'Toronto', country: 'CA' },
  { key: 'vancouver', city: 'Vancouver', country: 'CA' },
  { key: 'sydney', city: 'Sydney', country: 'AU' },
  { key: 'melbourne', city: 'Melbourne', country: 'AU' },
  { key: 'japan', city: null, country: 'JP' },
  { key: 'korea', city: null, country: 'KR' },
];

function extractPlace(text: string): { city: string | null; country: string } | null {
  const normalized = ` ${normalizeKeyPart(text)} `;
  let countryOnly: { city: string | null; country: string } | null = null;
  for (const place of KNOWN_PLACES) {
    if (normalized.includes(` ${place.key} `)) {
      if (place.city) return place;
      countryOnly = countryOnly ?? place;
    }
  }
  return countryOnly;
}

/** Badge type from the headline phrase — more precise than scanning the whole blob. */
function typeFromPhrase(phrase: string | null, blob: string): PulseEvent['type'] {
  const p = (phrase ?? '').toLowerCase();
  if (/fan\s*meeting|fanmeeting/.test(p)) return 'Fan Meeting';
  if (/fan\s*sign/.test(p)) return 'Fansign';
  if (/festival/.test(p)) return 'Festival';
  if (/pop[\s-]?up/.test(p)) return 'Pop-up Store';
  if (/exhibition/.test(p)) return 'Exhibition';
  if (p) return 'Concert';
  return classifyEventType(blob);
}

const HEADLINE_ANNOUNCE_VERB =
  /\b(announces?|announced|to\s+hold|holds?|kicks?\s+off|extends?|unveils?|reveals?|brings?|returns?|previews?|thrills?|delivers?|confirms?)\b/i;
const GENERIC_LEAD =
  /^(new|the|this|that|every|watch|how|why|what|when|where|top|breaking|exclusive|update|k-?pop)\b/i;

/**
 * Fallback act name: the words before the announce verb
 * (“OMEGA X Announces …” → “OMEGA X”, “SUPER JUNIOR's Yesung …” → “SUPER JUNIOR”).
 */
function artistFromHeadline(headline: string): string | null {
  const verb = headline.match(HEADLINE_ANNOUNCE_VERB);
  if (!verb || verb.index === undefined || verb.index === 0) return null;
  let lead = headline.slice(0, verb.index).trim();
  const possessive = lead.match(/^(.{2,30}?)['’]s\s+/);
  if (possessive) lead = possessive[1].trim();
  lead = lead.replace(/[,:;–—-]\s*$/, '').trim();
  if (!lead || lead.length > 30) return null;
  if (lead.split(/\s+/).length > 4) return null;
  if (GENERIC_LEAD.test(lead)) return null;
  return lead;
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
    .replace(/\bannounc(?:e|es|ed|ing)\b/gi, '')
    .replace(/\s*Tap Find Tickets[^.]*\.?/gi, '')
    .replace(/\s*The post\b[\s\S]*$/i, '')
    .replace(/\s*appeared first on\b[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length <= 240) return cleaned;
  return `${cleaned.slice(0, 237).trim()}…`;
}

function headlineHasEventInclude(headline: string): boolean {
  // Must look like an upcoming announcement — not a past show write-up.
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
    /** False for general music outlets — those items need a K-pop match. */
    kpopDedicated: boolean;
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

  const dictArtist = matchArtist(blob, opts.knownActKeys, opts.displayNames);

  // General music feeds carry mostly Western acts — keep only clearly K-pop items.
  if (!opts.kpopDedicated && !dictArtist && !KPOP_SIGNAL.test(blob)) {
    return { event: null, discardReason: 'not_kpop' };
  }

  // Headline-derived act names only when the item is already known to be K-pop.
  const artist = dictArtist ?? artistFromHeadline(titleRaw);

  const place = extractPlace(blob);
  const typePhrase = extractTypePhrase(titleRaw);
  const tourName = extractQuotedName(titleRaw);

  // Rewrite in our own words when the act is known — the card should read like
  // a concert listing, never like a news article.
  let headline: string;
  let shortDescription: string | null;
  if (artist && (typePhrase || tourName)) {
    const typeLabel = typePhrase ?? 'Concert';
    headline = tourName ? `${typeLabel} “${tourName}”` : typeLabel;
    shortDescription = `${artist} ${typeLabel} COMING UP`.toUpperCase();
  } else {
    headline = cleanHeadline(titleRaw);
    shortDescription = cleanShortSummary(description || content || headline);
  }

  const publishedDate = article.publishedAt?.slice(0, 10) || opts.today;
  const id = `evt-${stableHash(`${normalizeKeyPart(cleanHeadline(titleRaw))}|${article.url}`)}`;

  return {
    event: {
      id,
      type: typeFromPhrase(typePhrase, blob),
      title: headline,
      artist,
      group: artist,
      // Soft field for ordering only — never required for inclusion
      date: publishedDate && publishedDate.length === 10 ? publishedDate : todayUtcDateString(),
      time: null,
      venue: 'TBA',
      city: place?.city ?? 'TBA',
      country: place?.country ?? 'XX',
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
