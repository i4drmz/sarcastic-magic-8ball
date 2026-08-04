import type { PulseEvent, PulseEventType } from '../../src/models/pulseEvent';

export type { PulseEvent, PulseEventType };

export interface ProviderContext {
  /** ISO timestamp applied to every event from this run. */
  lastUpdated: string;
  /** UTC date YYYY-MM-DD — only upcoming events from this day onward. */
  today: string;
  log: (message: string) => void;
}

export interface ProviderResult {
  providerId: string;
  events: PulseEvent[];
  apiRequests: number;
  notes: string[];
  skipped?: boolean;
  skipReason?: string;
  /** Provider-specific diagnostics (e.g. per-feed RSS stats). */
  extras?: unknown;
}

export interface EventProvider {
  id: string;
  /** Human-readable name for logs / reports. */
  name: string;
  /**
   * Return false to skip without counting as a hard failure
   * (e.g. optional API key missing).
   */
  isEnabled(): boolean;
  fetch(ctx: ProviderContext): Promise<ProviderResult>;
}
