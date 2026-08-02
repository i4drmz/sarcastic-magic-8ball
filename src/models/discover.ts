export type DiscoverCategory =
  | 'trending-groups'
  | 'trending-songs'
  | 'trending-albums'
  | 'newest-debuts'
  | 'rookie-groups';

export interface DiscoverTile {
  id: string;
  category: DiscoverCategory;
  title: string;
  subtitle: string;
  imageUrl: string;
}
