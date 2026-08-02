import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getDailyBrief, getDiscoverTiles } from '@/services/home.service';

export function useDailyBrief() {
  return useQuery({
    queryKey: queryKeys.dailyBrief,
    queryFn: getDailyBrief,
  });
}

export function useDiscoverTiles() {
  return useQuery({
    queryKey: queryKeys.discoverTiles,
    queryFn: getDiscoverTiles,
  });
}
