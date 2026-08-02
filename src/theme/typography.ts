export const typography = {
  hero: { fontSize: 32, fontWeight: '700' as const, lineHeight: 38 },
  section: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  cardTitle: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: '500' as const, lineHeight: 17 },
};

export type TypographyToken = keyof typeof typography;
