import type { ChartEntry, ChartSource } from '@/models';
import { delay } from '@/utils/delay';
import chartsData from '@/data/charts.json';

const CHARTS = chartsData as Record<ChartSource, ChartEntry[]>;

/** Simulates `GET /charts/:source` for the Top Charts segmented control. */
export async function getChart(source: ChartSource): Promise<ChartEntry[]> {
  return delay(CHARTS[source] ?? [], 400);
}

export async function getAllCharts(): Promise<Record<ChartSource, ChartEntry[]>> {
  return delay(CHARTS, 400);
}
