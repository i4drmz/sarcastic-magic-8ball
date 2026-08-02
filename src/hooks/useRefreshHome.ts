import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/** Drives the Home screen's pull-to-refresh, invalidating every section's query. */
export function useRefreshHome() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  return { isRefreshing, refresh };
}
