/**
 * Free public RSS feeds used as the sole backend source for event discovery.
 * Feed ids are for pipeline logs only — never shown in the app UI.
 */

export interface RssFeedConfig {
  id: string;
  /** Internal label for the technical report (not shown in app). */
  label: string;
  url: string;
}

export const RSS_FEEDS: RssFeedConfig[] = [
  {
    id: 'soompi',
    label: 'Soompi',
    url: 'https://www.soompi.com/feed',
  },
  {
    id: 'soompi-music',
    label: 'Soompi Music',
    url: 'https://www.soompi.com/category/music/feed',
  },
  {
    id: 'allkpop',
    label: 'allkpop Lab',
    url: 'https://www.allkpop.com/rss_xml/lab.php',
  },
  {
    id: 'koreaboo',
    label: 'Koreaboo',
    url: 'https://www.koreaboo.com/feed',
  },
  {
    id: 'billboard',
    label: 'Billboard',
    url: 'https://www.billboard.com/feed/',
  },
  {
    id: 'billboard-music',
    label: 'Billboard Music',
    url: 'https://www.billboard.com/music/feed/',
  },
  {
    id: 'nme',
    label: 'NME',
    url: 'https://www.nme.com/feed',
  },
  {
    id: 'nme-music',
    label: 'NME Music',
    url: 'https://www.nme.com/news/music/feed',
  },
  {
    id: 'rollingstone',
    label: 'Rolling Stone',
    url: 'https://www.rollingstone.com/feed/',
  },
  {
    id: 'rollingstone-music',
    label: 'Rolling Stone Music News',
    url: 'https://www.rollingstone.com/music/music-news/feed/',
  },
  {
    id: 'hellokpop',
    label: 'helloKpop',
    url: 'https://hellokpop.com/feed/',
  },
  {
    id: 'biaslist',
    label: 'The Bias List',
    url: 'https://www.thebiaslist.com/feed/',
  },
];
