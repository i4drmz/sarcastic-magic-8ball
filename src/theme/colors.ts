/**
 * Raw color tokens for use outside of NativeWind class names
 * (e.g. LinearGradient, SVG fills, Reanimated interpolation, StyleSheet).
 * Keep these in sync with `tailwind.config.js`.
 */
export const colors = {
  background: '#09090B',
  surface: '#111113',
  card: '#18181B',
  border: 'rgba(255,255,255,0.06)',
  primary: '#FFFFFF',
  secondary: '#A1A1AA',
  muted: '#71717A',
  accent: '#FF4DA6',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
} as const;

export type ColorToken = keyof typeof colors;

/** Common gradient presets used across hero and media cards. */
export const gradients = {
  heroOverlay: ['transparent', 'rgba(9,9,11,0.55)', 'rgba(9,9,11,0.96)'] as const,
  cardOverlay: ['transparent', 'rgba(9,9,11,0.85)'] as const,
  accentGlow: ['rgba(255,77,166,0.35)', 'rgba(255,77,166,0)'] as const,
};
