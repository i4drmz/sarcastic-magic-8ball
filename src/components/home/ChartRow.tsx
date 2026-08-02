import React, { memo } from 'react';
import { Image, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { ChartEntry } from '@/models';
import { AnimatedPressable } from '@/components/ui';
import { colors } from '@/theme';

interface ChartRowProps {
  entry: ChartEntry;
  index: number;
  onPress?: (entry: ChartEntry) => void;
}

const MOVEMENT_CONFIG: Record<
  ChartEntry['movement'],
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  up: { icon: 'caret-up', color: colors.success },
  down: { icon: 'caret-down', color: colors.error },
  new: { icon: 'sparkles', color: colors.accent },
  same: { icon: 'remove', color: colors.muted },
};

function ChartRowBase({ entry, index, onPress }: ChartRowProps) {
  const movement = MOVEMENT_CONFIG[entry.movement];

  return (
    <Animated.View entering={FadeIn.delay(index * 35).duration(250)}>
      <AnimatedPressable onPress={() => onPress?.(entry)} accessibilityLabel={`${entry.songTitle} by ${entry.artistName}`}>
        <View className="flex-row items-center px-5 py-3">
          <View className="w-7 items-center">
            <Text className="text-body font-semibold text-secondary">{entry.rank}</Text>
          </View>
          <Image
            source={{ uri: entry.albumCoverUrl }}
            style={{ width: 46, height: 46, borderRadius: 10, marginLeft: 8, marginRight: 12 }}
          />
          <View className="flex-1 pr-3">
            <Text className="text-body font-semibold text-primary" numberOfLines={1}>
              {entry.songTitle}
            </Text>
            <Text className="text-caption text-secondary mt-0.5" numberOfLines={1}>
              {entry.artistName}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Ionicons name={movement.icon} size={14} color={movement.color} />
            {entry.movementAmount ? (
              <Text className="text-caption font-medium ml-1" style={{ color: movement.color }}>
                {entry.movementAmount}
              </Text>
            ) : null}
          </View>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export const ChartRow = memo(ChartRowBase);
