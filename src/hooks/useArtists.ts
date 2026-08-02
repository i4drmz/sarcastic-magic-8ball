import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/constants/queryKeys';
import { getTodaysBirthdays } from '@/services/birthday.service';

/** Local calendar date key so the cache rolls over at midnight on the device. */
function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Today's birthdays from the remote/local catalog JSON (never live Wikidata).
 * Refetches on mount / pull-to-refresh; the service layer enforces a 24h file cache.
 */
export function useTodaysBirthdays() {
  const dateKey = useMemo(() => todayKey(), []);

  const query = useQuery({
    queryKey: [...queryKeys.todaysBirthdays, dateKey],
    queryFn: () => getTodaysBirthdays(),
    staleTime: 60_000,
    refetchOnMount: 'always',
    retry: 1,
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    console.log('[birthday-debug][6-hook] useTodaysBirthdays state', {
      dateKey,
      status: query.status,
      fetchStatus: query.fetchStatus,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      isError: query.isError,
      error: query.error instanceof Error ? query.error.message : query.error,
      count: query.data?.length ?? 0,
      names: query.data?.map((b) => b.name) ?? [],
    });
  }, [
    dateKey,
    query.status,
    query.fetchStatus,
    query.isLoading,
    query.isFetching,
    query.isError,
    query.error,
    query.data,
  ]);

  return query;
}
