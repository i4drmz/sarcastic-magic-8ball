/** Catalog entry written by `scripts/updateBirthdays.ts` (single source of truth). */
export interface BirthdayCatalogEntry {
  id: string;
  name: string;
  group: string;
  birthday: string;
  image: string;
  wikidataId: string;
}

/** Home-screen birthday row model (mapped from a catalog entry). */
export interface Birthday {
  id: string;
  artistId: string;
  name: string;
  groupName?: string;
  /** Empty when no image — UI shows the avatar placeholder. */
  avatarUrl: string;
  birthDate: string;
  turningAge?: number;
}
