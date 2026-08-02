import React, { memo, useState } from 'react';
import { View } from 'react-native';
import type { ChartEntry, ChartSource } from '@/models';
import { ChartTabs } from './ChartTabs';
import { ChartRow } from './ChartRow';
import { LoadingSkeleton, EmptyState } from '@/components/ui';

interface TopChartsSectionProps {
  entries?: ChartEntry[];
  isLoading?: boolean;
  activeChart: ChartSource;
  onChartChange: (chart: ChartSource) => void;
  onEntryPress?: (entry: ChartEntry) => void;
}

const CHART_TABS: { id: ChartSource; label: string }[] = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'melon', label: 'Melon' },
  { id: 'billboard', label: 'Billboard' },
  { id: 'circle', label: 'Circle' },
  { id: 'youtube', label: 'YouTube' },
];

function TopChartsSectionBase({
  entries,
  isLoading,
  activeChart,
  onChartChange,
  onEntryPress,
}: TopChartsSectionProps) {
  const [key, setKey] = useState(0);

  const handleChange = (chart: ChartSource) => {
    onChartChange(chart);
    setKey((k) => k + 1);
  };

  return (
    <View className="mb-8">
      <ChartTabs tabs={CHART_TABS} activeTab={activeChart} onTabChange={handleChange} />
      {isLoading ? (
        <View className="px-5">
          {[0, 1, 2, 3].map((k) => (
            <LoadingSkeleton key={k} width="100%" height={46} borderRadius={10} style={{ marginBottom: 14 }} />
          ))}
        </View>
      ) : !entries?.length ? (
        <EmptyState icon="bar-chart-outline" title="Chart unavailable" message="This chart isn't reporting data right now." />
      ) : (
        <View key={key}>
          {entries.map((entry, index) => (
            <ChartRow key={entry.id} entry={entry} index={index} onPress={onEntryPress} />
          ))}
        </View>
      )}
    </View>
  );
}

export const TopChartsSection = memo(TopChartsSectionBase);
