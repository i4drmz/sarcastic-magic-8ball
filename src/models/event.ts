export type EventType = 'comeback' | 'concert' | 'fanmeeting' | 'award' | 'anniversary';

export interface Event {
  id: string;
  type: EventType;
  title: string;
  artistName: string;
  imageUrl: string;
  date: string;
  daysUntil: number;
  location?: string;
}
