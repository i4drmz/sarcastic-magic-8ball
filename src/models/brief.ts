export interface DailyBriefStat {
  id: string;
  icon: 'news' | 'release' | 'birthday' | 'comeback' | 'award';
  label: string;
  count: number;
}

export interface DailyBrief {
  date: string;
  stats: DailyBriefStat[];
}
