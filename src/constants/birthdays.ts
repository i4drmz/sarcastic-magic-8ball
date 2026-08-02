/**
 * Pulse remote data root.
 * Set EXPO_PUBLIC_PULSE_DATA_BASE_URL at build time (see .env / .env.example).
 *
 * Example: https://raw.githubusercontent.com/<user>/<repo>/main/data
 *
 * Derived paths:
 *   ${base}/birthdays.json
 *   ${base}/images/<file>.webp
 */
export const PULSE_DATA_BASE_URL = (
  process.env.EXPO_PUBLIC_PULSE_DATA_BASE_URL ?? ''
)
  .trim()
  .replace(/\/+$/, '');

/** Remote catalog JSON consumed by the mobile app. Empty when base URL is unset. */
export const BIRTHDAYS_JSON_URL = PULSE_DATA_BASE_URL
  ? `${PULSE_DATA_BASE_URL}/birthdays.json`
  : '';

/** How long the on-device catalog cache is considered fresh. */
export const BIRTHDAYS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
