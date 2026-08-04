/**
 * Minimal RSS 2.0 / Atom parser — no third-party XML dependencies.
 */

export interface RssItem {
  title: string;
  link: string;
  description: string;
  content: string;
  publishedAt: string | null;
  image: string | null;
}

function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function stripHtml(input: string): string {
  return decodeEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tagContent(block: string, tag: string): string {
  const re = new RegExp(
    `<(?:${tag}|[a-z0-9]+:${tag})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:${tag}|[a-z0-9]+:${tag})>`,
    'i',
  );
  const m = block.match(re);
  return m ? decodeEntities(m[1].trim()) : '';
}

function attrValue(block: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["'][^>]*\\/?>`, 'i');
  const m = block.match(re);
  return m?.[1] ? decodeEntities(m[1]) : null;
}

function extractImage(block: string, description: string, content: string): string | null {
  const enclosure = attrValue(block, 'enclosure', 'url');
  if (enclosure && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(enclosure)) return enclosure;

  const media = attrValue(block, 'media:content', 'url') || attrValue(block, 'media:thumbnail', 'url');
  if (media) return media;

  const html = `${description}\n${content}`;
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img?.[1]) return decodeEntities(img[1]);

  return null;
}

function parseRss20(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const block = match[0];
    const title = stripHtml(tagContent(block, 'title'));
    const link =
      stripHtml(tagContent(block, 'link')) ||
      attrValue(block, 'link', 'href') ||
      stripHtml(tagContent(block, 'guid'));
    if (!title || !link) continue;

    const descriptionRaw = tagContent(block, 'description');
    const contentRaw =
      tagContent(block, 'content:encoded') || tagContent(block, 'content') || descriptionRaw;
    const publishedRaw =
      tagContent(block, 'pubDate') || tagContent(block, 'dc:date') || tagContent(block, 'published');
    const publishedAt = publishedRaw ? new Date(publishedRaw).toISOString() : null;

    items.push({
      title,
      link: link.trim(),
      description: stripHtml(descriptionRaw),
      content: stripHtml(contentRaw),
      publishedAt: publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? publishedAt : null,
      image: extractImage(block, descriptionRaw, contentRaw),
    });
  }
  return items;
}

function parseAtom(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const re = /<entry\b[\s\S]*?<\/entry>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const block = match[0];
    const title = stripHtml(tagContent(block, 'title'));
    const link =
      attrValue(block, 'link', 'href') ||
      stripHtml(tagContent(block, 'id')) ||
      stripHtml(tagContent(block, 'link'));
    if (!title || !link) continue;

    const summaryRaw = tagContent(block, 'summary');
    const contentRaw = tagContent(block, 'content') || summaryRaw;
    const publishedRaw = tagContent(block, 'published') || tagContent(block, 'updated');
    const publishedAt = publishedRaw ? new Date(publishedRaw).toISOString() : null;

    items.push({
      title,
      link: link.trim(),
      description: stripHtml(summaryRaw),
      content: stripHtml(contentRaw),
      publishedAt: publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? publishedAt : null,
      image: extractImage(block, summaryRaw, contentRaw),
    });
  }
  return items;
}

export function parseFeedXml(xml: string): RssItem[] {
  const trimmed = xml.trim();
  if (!trimmed) return [];
  if (/<rss\b/i.test(trimmed) || /<channel\b/i.test(trimmed)) {
    return parseRss20(trimmed);
  }
  if (/<feed\b/i.test(trimmed) && /xmlns=["'][^"']*Atom/i.test(trimmed)) {
    return parseAtom(trimmed);
  }
  // Fallback: try both
  const rss = parseRss20(trimmed);
  if (rss.length) return rss;
  return parseAtom(trimmed);
}

export function looksLikeRss(xml: string): boolean {
  const head = xml.slice(0, 800).toLowerCase();
  return (
    head.includes('<rss') ||
    head.includes('<feed') ||
    head.includes('<channel') ||
    head.includes('application/rss')
  );
}
