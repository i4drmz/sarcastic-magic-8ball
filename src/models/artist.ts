export interface Artist {
  id: string;
  name: string;
  stageName?: string;
  groupName?: string;
  avatarUrl: string;
  coverUrl?: string;
  agency?: string;
  isGroup: boolean;
  memberCount?: number;
  debutDate?: string;
  fandomName?: string;
  bio?: string;
  isFollowing?: boolean;
}
