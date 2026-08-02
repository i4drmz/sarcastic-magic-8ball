import type { Artist } from '@/models';
import { delay } from '@/utils/delay';
import artistsData from '@/data/artists.json';

const ARTISTS: Artist[] = artistsData as Artist[];

/** Simulates `GET /artists`. */
export async function getArtists(): Promise<Artist[]> {
  return delay(ARTISTS, 400);
}

export async function getArtistById(id: string): Promise<Artist | undefined> {
  return delay(ARTISTS.find((artist) => artist.id === id), 300);
}

/** @deprecated Prefer importing from `@/services/birthday.service` — kept as a thin re-export for callers. */
export { getTodaysBirthdays } from '@/services/birthday.service';
