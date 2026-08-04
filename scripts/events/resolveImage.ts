import { fetchText } from './http';

/**
 * Pull a share image from article HTML (Open Graph / Twitter card).
 * Used when the RSS item itself has no enclosure or inline image.
 */
export function extractShareImage(html: string): string | null {
  const patterns = [
    /property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i,
    /name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const url = m?.[1]?.trim();
    if (url && /^https?:\/\//i.test(url)) return url;
  }
  return null;
}

export async function resolveArticleImage(
  articleUrl: string,
  gapMs = 200,
): Promise<string | null> {
  try {
    const res = await fetchText(articleUrl, {
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      gapMs,
    });
    if (!res.ok) return null;
    return extractShareImage(res.text);
  } catch {
    return null;
  }
}
