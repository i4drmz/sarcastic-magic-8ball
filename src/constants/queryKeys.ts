export const queryKeys = {
  dailyBrief: ['daily-brief'] as const,
  discoverTiles: ['discover-tiles'] as const,
  notifications: ['notifications'] as const,
  featuredNews: ['news', 'featured'] as const,
  trendingNews: ['news', 'trending'] as const,
  newReleases: ['releases', 'new'] as const,
  chart: (source: string) => ['charts', source] as const,
  upcomingEvents: ['events', 'upcoming'] as const,
  todaysBirthdays: ['artists', 'birthdays', 'today'] as const,
};
