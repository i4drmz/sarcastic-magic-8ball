import React, { memo } from 'react';
import { Image, Text, View } from 'react-native';
import type { Event } from '@/models';
import { AnimatedPressable, SectionHeader, LoadingSkeleton, EmptyState } from '@/components/ui';
import { formatCountdown } from '@/utils/formatDate';

interface UpcomingCarouselProps {
  events?: Event[];
  isLoading?: boolean;
  onEventPress?: (event: Event) => void;
  onSeeAllPress?: () => void;
}

const MAX_TILES = 6;

const EVENT_TYPE_LABELS: Record<Event['type'], string> = {
  comeback: 'Comeback',
  concert: 'Concert',
  fanmeeting: 'Fan Meeting',
  award: 'Award Show',
  anniversary: 'Anniversary',
};

function UpcomingTile({ event, onPress }: { event: Event; onPress?: (event: Event) => void }) {
  return (
    <AnimatedPressable
      onPress={() => onPress?.(event)}
      accessibilityLabel={`${event.artistName} ${event.title}`}
      style={{ width: '48%' }}
    >
      <View className="flex-row items-center bg-white/5 rounded-2xl p-2.5">
        <Image
          source={{ uri: event.imageUrl }}
          style={{ width: 52, height: 52, borderRadius: 12 }}
          resizeMode="cover"
        />
        <View className="ml-3 flex-1">
          <View className="bg-accent rounded-full px-2 py-0.5 self-start mb-1">
            <Text className="text-[10px] font-bold text-primary">{formatCountdown(event.daysUntil)}</Text>
          </View>
          <Text className="text-caption font-semibold text-primary" numberOfLines={1}>
            {event.artistName}
          </Text>
          <Text className="text-[11px] text-muted mt-0.5" numberOfLines={1}>
            {EVENT_TYPE_LABELS[event.type]}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

function UpcomingCarouselBase({ events, isLoading, onEventPress, onSeeAllPress }: UpcomingCarouselProps) {
  const tiles = events?.slice(0, MAX_TILES);

  return (
    <View className="mb-8">
      <SectionHeader title="Upcoming" onActionPress={onSeeAllPress} />
      <View className="mx-5 p-4 rounded-card bg-card border border-border">
        {isLoading ? (
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            {[0, 1, 2, 3].map((key) => (
              <LoadingSkeleton key={key} width="48%" height={72} borderRadius={16} />
            ))}
          </View>
        ) : !tiles?.length ? (
          <EmptyState icon="calendar-outline" title="Nothing upcoming" message="Comebacks, concerts, and more will appear here." />
        ) : (
          <View className="flex-row flex-wrap justify-between" style={{ rowGap: 12 }}>
            {tiles.map((event) => (
              <UpcomingTile key={event.id} event={event} onPress={onEventPress} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export const UpcomingCarousel = memo(UpcomingCarouselBase);
