import React, { memo } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DailyBrief, DailyBriefStat } from '@/models';
import { Button, LoadingSkeleton } from '@/components/ui';
import { colors } from '@/theme';

interface DailyBriefCardProps {
  brief?: DailyBrief;
  isLoading?: boolean;
  onExplorePress?: () => void;
}

const STAT_ICONS: Record<DailyBriefStat['icon'], keyof typeof Ionicons.glyphMap> = {
  news: 'flame',
  release: 'musical-notes',
  birthday: 'gift',
  comeback: 'calendar',
  award: 'trophy',
};

const COLUMNS = 3;

/** Splits the stats into fixed-size rows so the grid always reads as tidy rows. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

function StatTile({ stat }: { stat: DailyBriefStat }) {
  return (
    <View className="flex-1 items-center bg-white/5 rounded-2xl py-2.5 px-1">
      <Ionicons name={STAT_ICONS[stat.icon]} size={15} color={colors.accent} />
      <Text className="text-body font-bold text-primary mt-1">{stat.count}</Text>
      <Text className="text-[11px] text-muted mt-0.5" numberOfLines={1}>
        {stat.label}
      </Text>
    </View>
  );
}

function DailyBriefCardBase({ brief, isLoading, onExplorePress }: DailyBriefCardProps) {
  if (isLoading || !brief) {
    return (
      <View className="mx-5 mb-4 p-4 rounded-card bg-card border border-border">
        <LoadingSkeleton width={72} height={12} />
        <View className="flex-row mt-3" style={{ gap: 8 }}>
          {[0, 1, 2].map((key) => (
            <LoadingSkeleton key={key} width="100%" height={62} borderRadius={16} style={{ flex: 1 }} />
          ))}
        </View>
        <LoadingSkeleton width="55%" height={38} borderRadius={999} style={{ marginTop: 12 }} />
      </View>
    );
  }

  const rows = chunk(brief.stats, COLUMNS);

  return (
    <View className="mx-5 mb-4 p-4 rounded-card bg-card border border-border">
      <Text className="text-caption text-muted uppercase tracking-wide mb-2.5">Today</Text>
      <View style={{ gap: 8 }}>
        {rows.map((row, index) => (
          <View key={index} className="flex-row" style={{ gap: 8 }}>
            {row.map((stat) => (
              <StatTile key={stat.id} stat={stat} />
            ))}
            {row.length < COLUMNS
              ? Array.from({ length: COLUMNS - row.length }).map((_, i) => (
                  <View key={`spacer-${i}`} className="flex-1" />
                ))
              : null}
          </View>
        ))}
      </View>
      <View className="mt-3">
        <Button label="Explore Today" onPress={onExplorePress} size="md" />
      </View>
    </View>
  );
}

export const DailyBriefCard = memo(DailyBriefCardBase);
