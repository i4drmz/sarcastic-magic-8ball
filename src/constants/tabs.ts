import type { Ionicons } from '@expo/vector-icons';

export interface TabConfig {
  name: string;
  route: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
}

export const TABS: TabConfig[] = [
  {
    name: 'index',
    route: '/',
    activeIcon: 'home',
    inactiveIcon: 'home-outline',
    accessibilityLabel: 'Home',
  },
  {
    name: 'discover',
    route: '/discover',
    activeIcon: 'compass',
    inactiveIcon: 'compass-outline',
    accessibilityLabel: 'Discover',
  },
  {
    name: 'charts',
    route: '/charts',
    activeIcon: 'bar-chart',
    inactiveIcon: 'bar-chart-outline',
    accessibilityLabel: 'Charts',
  },
  {
    name: 'calendar',
    route: '/calendar',
    activeIcon: 'calendar',
    inactiveIcon: 'calendar-outline',
    accessibilityLabel: 'Calendar',
  },
  {
    name: 'profile',
    route: '/profile',
    activeIcon: 'person',
    inactiveIcon: 'person-outline',
    accessibilityLabel: 'Profile',
  },
];
