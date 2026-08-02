/**
 * Computes a time-of-day greeting for the Home header. Kept separate from
 * the Daily Brief mock data so the greeting always reflects the device's
 * actual clock instead of a static value.
 */
export function getGreeting(now: Date = new Date()): string {
  const hour = now.getHours();

  if (hour < 5) return 'Good Night';
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  if (hour < 22) return 'Good Evening';
  return 'Good Night';
}
