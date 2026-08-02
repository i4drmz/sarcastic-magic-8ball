import type { Event } from '@/models';
import { delay } from '@/utils/delay';
import eventsData from '@/data/events.json';

const EVENTS: Event[] = eventsData as Event[];

/** Simulates `GET /events/upcoming` for the Upcoming section. */
export async function getUpcomingEvents(): Promise<Event[]> {
  return delay(EVENTS, 450);
}
