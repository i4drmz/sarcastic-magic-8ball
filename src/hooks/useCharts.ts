import { useQuery } from '@tanstack/react-query';
import type { ChartSource } from '@/models';
import { queryKeys } from '@/constants/queryKeys';
import { getChart } from '@/services/charts.service';

export function useChart(source: ChartSource) {
  return useQuery({
    queryKey: queryKeys.chart(source),
    queryFn: () => getChart(source),
  });
}
