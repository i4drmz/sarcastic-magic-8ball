import React, { memo } from 'react';
import { Image, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { DiscoverTile } from '@/models';
import { AnimatedPressable, LoadingSkeleton, EmptyState } from '@/components/ui';
import { gradients } from '@/theme';

interface DiscoverGridProps {
  tiles?: DiscoverTile[];
  isLoading?: boolean;
  onTilePress?: (tile: DiscoverTile) => void;
}

function DiscoverTileCard({ tile, onPress }: { tile: DiscoverTile; onPress?: (t: DiscoverTile) => void }) {
  return (
    <AnimatedPressable
      onPress={() => onPress?.(tile)}
      accessibilityLabel={tile.title}
      style={{ width: '48%', marginBottom: 16 }}
    >
      <View className="rounded-2xl overflow-hidden bg-card" style={{ height: 120 }}>
        <Image source={{ uri: tile.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        <LinearGradient colors={gradients.cardOverlay} style={{ position: 'absolute', inset: 0 }} />
        <View className="absolute bottom-0 left-0 right-0 p-3.5">
          <Text className="text-body font-semibold text-primary" numberOfLines={1}>
            {tile.title}
          </Text>
          <Text className="text-caption text-secondary mt-0.5" numberOfLines={1}>
            {tile.subtitle}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function DiscoverGridBase({ tiles, isLoading, onTilePress }: DiscoverGridProps) {
  return (
    <View className="mb-4">
      {isLoading ? (
        <View className="flex-row flex-wrap justify-between px-5">
          {[0, 1, 2, 3].map((key) => (
            <LoadingSkeleton key={key} width="48%" height={120} borderRadius={16} style={{ marginBottom: 16 }} />
          ))}
        </View>
      ) : !tiles?.length ? (
        <EmptyState icon="grid-outline" title="Nothing to discover yet" />
      ) : (
        <View className="flex-row flex-wrap justify-between px-5">
          {tiles.map((tile) => (
            <DiscoverTileCard key={tile.id} tile={tile} onPress={onTilePress} />
          ))}
        </View>
      )}
    </View>
  );
}

export const DiscoverGrid = memo(DiscoverGridBase);
