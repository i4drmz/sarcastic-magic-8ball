import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getUpcomingEvents } from '@/services/events.service';

export function useUpcomingEvents() {
  return useQuery({
    queryKey: queryKeys.upcomingEvents,
    queryFn: getUpcomingEvents,
  });
}
