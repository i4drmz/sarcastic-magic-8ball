import type { Album, Release } from '@/models';
import { delay } from '@/utils/delay';
import releasesData from '@/data/releases.json';

const RELEASES: Release[] = releasesData as Release[];

/** Simulates `GET /releases/new` for the New Releases carousel. */
export async function getNewReleases(): Promise<Release[]> {
  return delay(RELEASES, 450);
}

export async function getAlbumById(id: string): Promise<Album | undefined> {
  return delay(RELEASES.find((release) => release.album.id === id)?.album, 300);
}
