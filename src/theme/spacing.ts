export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

export type SpacingToken = keyof typeof spacing;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  card: 24,
  pill: 999,
} as const;
