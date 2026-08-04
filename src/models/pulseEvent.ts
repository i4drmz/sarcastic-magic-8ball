/**
 * Hosted event discovery catalog written by `scripts/updateEvents.ts`.
 * Backend may derive rows from public RSS feeds; the app treats them only as events.
 */

export const PULSE_EVENT_TYPES = [
  'Concert',
  'Festival',
  'Fan Meeting',
  'Fansign',
  'Album Release',
  'Pop-up Store',
  'Exhibition',
  'Convention',
  'Community Event',
  'Local Event',
] as const;

export type PulseEventType = (typeof PULSE_EVENT_TYPES)[number];

/**
 * Event Discovery card.
 * Core display fields: title (headline), artist, image, shortDescription.
 * Other fields are optional soft metadata and must not gate inclusion.
 */
export interface PulseEvent {
  id: string;
  type: PulseEventType;
  /** Headline shown on the event card. */
  title: string;
  artist: string | null;
  group: string | null;
  /** Soft ordering hint (often publish day) — not required for display. */
  date: string;
  time: string | null;
  venue: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  image: string | null;
  shortDescription: string | null;
  /** Internal only — never shown or linked in the UI. */
  sourceUrl: string | null;
  ticketUrl: string | null;
  /** Pipeline provider id. Never display in UI. */
  source: string;
  lastUpdated: string;
}

export interface PulseEventCatalog {
  generatedAt: string;
  lastUpdated: string;
  sourceSummary: string[];
  events: PulseEvent[];
}

export interface PulseEventWithDistance extends PulseEvent {
  distanceKm: number | null;
}
