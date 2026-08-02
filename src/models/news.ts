export type NewsCategory =
  | 'comeback'
  | 'award'
  | 'concert'
  | 'variety'
  | 'chart'
  | 'industry'
  | 'exclusive';

export interface NewsSource {
  id: string;
  name: string;
  logoUrl?: string;
}

export interface News {
  id: string;
  headline: string;
  summary: string;
  imageUrl: string;
  category: NewsCategory;
  source: NewsSource;
  publishedAt: string;
  relatedArtistIds?: string[];
  isBookmarked?: boolean;
  isFeatured?: boolean;
  readMinutes?: number;
}
