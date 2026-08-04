/**
 * Free public RSS feeds used as the sole backend source for event discovery.
 * Feed ids are for pipeline logs only — never shown in the app UI.
 */

export interface RssFeedConfig {
  id: string;
  /** Internal label for the technical report (not shown in app). */
  label: string;
  url: string;
  /**
   * True when the outlet covers K-pop exclusively. Items from general music
   * feeds must additionally match a known K-pop act or explicit K-pop wording.
   */
  kpopDedicated: boolean;
}

export const RSS_FEEDS: RssFeedConfig[] = [
  {
    id: 'soompi',
    label: 'Soompi',
    url: 'https://www.soompi.com/feed',
    kpopDedicated: true,
  },
  {
    id: 'soompi-music',
    label: 'Soompi Music',
    url: 'https://www.soompi.com/category/music/feed',
    kpopDedicated: true,
  },
  {
    id: 'allkpop',
    label: 'allkpop Lab',
    url: 'https://www.allkpop.com/rss_xml/lab.php',
    kpopDedicated: true,
  },
  {
    id: 'koreaboo',
    label: 'Koreaboo',
    url: 'https://www.koreaboo.com/feed',
    kpopDedicated: true,
  },
  {
    id: 'billboard',
    label: 'Billboard',
    url: 'https://www.billboard.com/feed/',
    kpopDedicated: false,
  },
  {
    id: 'billboard-music',
    label: 'Billboard Music',
    url: 'https://www.billboard.com/music/feed/',
    kpopDedicated: false,
  },
  {
    id: 'nme',
    label: 'NME',
    url: 'https://www.nme.com/feed',
    kpopDedicated: false,
  },
  {
    id: 'nme-music',
    label: 'NME Music',
    url: 'https://www.nme.com/news/music/feed',
    kpopDedicated: false,
  },
  {
    id: 'rollingstone',
    label: 'Rolling Stone',
    url: 'https://www.rollingstone.com/feed/',
    kpopDedicated: false,
  },
  {
    id: 'rollingstone-music',
    label: 'Rolling Stone Music News',
    url: 'https://www.rollingstone.com/music/music-news/feed/',
    kpopDedicated: false,
  },
  {
    id: 'hellokpop',
    label: 'helloKpop',
    url: 'https://hellokpop.com/feed/',
    kpopDedicated: true,
  },
  {
    id: 'biaslist',
    label: 'The Bias List',
    url: 'https://www.thebiaslist.com/feed/',
    kpopDedicated: true,
  },
];
