export type ChartSource = 'spotify' | 'melon' | 'billboard' | 'circle' | 'youtube';

export type ChartMovement = 'up' | 'down' | 'new' | 'same';

export interface ChartEntry {
  id: string;
  chart: ChartSource;
  rank: number;
  previousRank?: number;
  movement: ChartMovement;
  movementAmount?: number;
  songTitle: string;
  artistName: string;
  albumCoverUrl: string;
}
