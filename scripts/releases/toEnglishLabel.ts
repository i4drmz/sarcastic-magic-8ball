import axios from 'axios';
import { romanize } from 'es-hangul';

const HANGUL_RE = /[\uAC00-\uD7A3]/;
const cache = new Map<string, string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prefer Latin text inside parentheses, e.g. "다영 (DAYOUNG)" → "DAYOUNG". */
function parentheticalEnglish(text: string): string | null {
  const matches = [...text.matchAll(/\(([^)]+)\)/g)];
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const inner = matches[i][1].trim();
    if (inner && !HANGUL_RE.test(inner) && /[A-Za-z0-9]/.test(inner)) {
      return inner;
    }
  }
  return null;
}

function titleCaseWords(text: string): string {
  return text
    .split(/(\s+|-)/)
    .map((part) => {
      if (!part || /^\s+$/.test(part) || part === '-') return part;
      if (/^[A-Z0-9]+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

function romanizeHangul(text: string): string {
  const romanized = text.replace(/[\uAC00-\uD7A3]+/g, (chunk) => romanize(chunk));
  return titleCaseWords(romanized.replace(/\s+/g, ' ').trim());
}

async function translateKoToEn(text: string): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ko|en`;
    const { data } = await axios.get(url, { timeout: 12000 });
    const translated = String(data?.responseData?.translatedText || '').trim();
    if (!translated || translated.toUpperCase() === 'NULL') return null;
    // Ignore obviously broken / same-script failures.
    if (HANGUL_RE.test(translated)) return null;
    return translated;
  } catch {
    return null;
  }
}

/**
 * Convert Melon labels to English-friendly display text.
 * 1) Prefer English in parentheses
 * 2) Translate Hangul → English
 * 3) Fall back to romanization
 */
export async function toEnglishLabel(raw: string): Promise<string> {
  const cleaned = raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return cleaned;

  const cached = cache.get(cleaned);
  if (cached) return cached;

  const paren = parentheticalEnglish(cleaned);
  if (paren) {
    cache.set(cleaned, paren);
    return paren;
  }

  if (!HANGUL_RE.test(cleaned)) {
    cache.set(cleaned, cleaned);
    return cleaned;
  }

  await sleep(80);
  const translated = await translateKoToEn(cleaned);
  const result = translated || romanizeHangul(cleaned);
  cache.set(cleaned, result);
  return result;
}
