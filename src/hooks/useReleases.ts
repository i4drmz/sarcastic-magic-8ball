import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getNewReleases } from '@/services/albums.service';

export function useNewReleases() {
  return useQuery({
    queryKey: queryKeys.newReleases,
    queryFn: getNewReleases,
  });
}
