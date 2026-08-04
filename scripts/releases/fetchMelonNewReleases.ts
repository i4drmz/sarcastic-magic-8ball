import axios from 'axios';
import * as cheerio from 'cheerio';

const MELON_NEW_URL = 'https://www.melon.com/new/index.htm';
const MAX_SONGS = 10;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export interface MelonNewSong {
  title: string;
  artist: string;
  image: string | null;
  link: string | null;
}

export interface MelonNewReleases {
  count: number;
  songs: MelonNewSong[];
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Prefer the full 500px Melon cover, not the tiny list thumbnail. */
function albumCoverUrl(src: string | undefined): string | null {
  if (!src) return null;
  const match = src.match(/https?:\/\/cdnimg\.melon\.co\.kr\/cm2\/album\/images\/[^"'\\\s>]+?_500\.jpg/i);
  return match?.[0] ?? (src.startsWith('http') ? src.split('/melon/')[0] : null);
}

function songLink(songId: string | undefined): string | null {
  if (!songId) return null;
  return `https://www.melon.com/song/detail.htm?songId=${songId}`;
}

/** Scrape Melon new music. On failure returns { count: 0, songs: [] }. */
export async function fetchMelonNewReleases(): Promise<MelonNewReleases> {
  try {
    const { data } = await axios.get(MELON_NEW_URL, {
      headers: BROWSER_HEADERS,
      timeout: 20000,
    });

    const $ = cheerio.load(String(data));
    const songs: MelonNewSong[] = [];

    $('div.service_list_song table tbody tr').each((_, row) => {
      const $row = $(row);
      const title = cleanText($row.find('div.ellipsis.rank01 a').first().text());
      const artist = cleanText(
        $row.find('div.ellipsis.rank02 span a').first().text() ||
          $row.find('div.ellipsis.rank02 a').first().text(),
      );
      if (!title || !artist) return;

      songs.push({
        title,
        artist,
        image: albumCoverUrl($row.find('img[src*="album/images"]').attr('src')),
        link: songLink($row.find('input.input_check').attr('value')),
      });
    });

    return {
      count: songs.length,
      songs: songs.slice(0, MAX_SONGS),
    };
  } catch {
    return { count: 0, songs: [] };
  }
}

const ranDirectly = /fetchMelonNewReleases\.(ts|js)$/.test(
  process.argv[1]?.replace(/\\/g, '/') ?? '',
);
if (ranDirectly) {
  fetchMelonNewReleases().then((result) => {
    console.log(JSON.stringify(result, null, 2));
  });
}
