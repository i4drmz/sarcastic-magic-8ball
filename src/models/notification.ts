export type NotificationType =
  | 'news'
  | 'release'
  | 'birthday'
  | 'event'
  | 'chart'
  | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  imageUrl?: string;
  createdAt: string;
  isRead: boolean;
}
