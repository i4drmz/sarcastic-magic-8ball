import type { News } from '@/models';
import { delay } from '@/utils/delay';
import newsData from '@/data/news.json';

const NEWS: News[] = newsData as News[];

/** Simulates `GET /news` — replace with a real API call when the backend is ready. */
export async function getNews(): Promise<News[]> {
  return delay(NEWS, 450);
}

/** Simulates `GET /news/trending` — a curated subset for the horizontal carousel. */
export async function getTrendingNews(): Promise<News[]> {
  return delay(NEWS.filter((item) => !item.isFeatured), 450);
}

/** Simulates `GET /news/featured` — a single hero story for the day. */
export async function getFeaturedNews(): Promise<News | null> {
  const featured = NEWS.find((item) => item.isFeatured) ?? NEWS[0] ?? null;
  return delay(featured, 400);
}

export async function getNewsById(id: string): Promise<News | undefined> {
  return delay(NEWS.find((item) => item.id === id), 300);
}
