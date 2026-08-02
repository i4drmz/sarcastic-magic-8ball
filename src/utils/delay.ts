/**
 * Simulates network latency for mock service calls so loading states,
 * skeletons, and pull-to-refresh feel realistic during development.
 */
export function delay<T>(value: T, ms = 500): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
