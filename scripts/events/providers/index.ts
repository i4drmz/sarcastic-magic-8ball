import type { EventProvider } from '../types';
import { rssProvider } from './rss';

/**
 * Event provider registry — free public RSS feeds only.
 */
export const EVENT_PROVIDERS: EventProvider[] = [rssProvider];

export function getEnabledProviders(): EventProvider[] {
  return EVENT_PROVIDERS.filter((p) => p.isEnabled());
}
