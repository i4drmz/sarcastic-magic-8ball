import type { DailyBrief, DiscoverTile, Notification } from '@/models';
import { delay } from '@/utils/delay';
import dailyBriefData from '@/data/dailyBrief.json';
import discoverData from '@/data/discover.json';
import notificationsData from '@/data/notifications.json';

const DAILY_BRIEF = dailyBriefData as DailyBrief;
const DISCOVER_TILES = discoverData as DiscoverTile[];
const NOTIFICATIONS = notificationsData as Notification[];

/** Simulates `GET /home/brief` for the Daily Brief card. */
export async function getDailyBrief(): Promise<DailyBrief> {
  return delay(DAILY_BRIEF, 350);
}

/** Simulates `GET /discover/sections` for the Discover More grid. */
export async function getDiscoverTiles(): Promise<DiscoverTile[]> {
  return delay(DISCOVER_TILES, 350);
}

/** Simulates `GET /notifications`. */
export async function getNotifications(): Promise<Notification[]> {
  return delay(NOTIFICATIONS, 350);
}

export async function getUnreadNotificationCount(): Promise<number> {
  return delay(NOTIFICATIONS.filter((n) => !n.isRead).length, 200);
}
