import type { Event } from '@/models';
import { delay } from '@/utils/delay';
import eventsData from '@/data/events.json';

const EVENTS: Event[] = eventsData as Event[];

/** Simulates `GET /calendar?month=YYYY-MM` for the future Calendar tab. */
export async function getEventsForMonth(month: string): Promise<Event[]> {
  const filtered = EVENTS.filter((event) => event.date.startsWith(month));
  return delay(filtered, 400);
}

export async function getEventsForDate(date: string): Promise<Event[]> {
  return delay(EVENTS.filter((event) => event.date === date), 300);
}
