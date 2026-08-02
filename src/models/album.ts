export type ReleaseType = 'album' | 'ep' | 'single' | 'mixtape' | 'ost';

export interface Album {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  coverUrl: string;
  releaseType: ReleaseType;
  trackCount?: number;
  isSaved?: boolean;
}

export interface Release {
  id: string;
  album: Album;
  releaseDate: string;
  isPreRelease?: boolean;
  isNew?: boolean;
}
