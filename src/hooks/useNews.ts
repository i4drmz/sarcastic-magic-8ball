import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getFeaturedNews, getTrendingNews } from '@/services/news.service';

export function useFeaturedNews() {
  return useQuery({
    queryKey: queryKeys.featuredNews,
    queryFn: getFeaturedNews,
  });
}

export function useTrendingNews() {
  return useQuery({
    queryKey: queryKeys.trendingNews,
    queryFn: getTrendingNews,
  });
}
