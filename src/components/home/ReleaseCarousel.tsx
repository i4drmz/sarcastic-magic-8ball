import React, { memo, useCallback } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { Release } from '@/models';
import { AlbumCard } from './AlbumCard';
import { SectionHeader, LoadingSkeleton, EmptyState } from '@/components/ui';
import { useBookmarkStore } from '@/store/useBookmarkStore';

interface ReleaseCarouselProps {
  releases?: Release[];
  isLoading?: boolean;
  onReleasePress?: (release: Release) => void;
  onPlayPress?: (release: Release) => void;
  onSeeAllPress?: () => void;
}

function ReleaseCarouselBase({
  releases,
  isLoading,
  onReleasePress,
  onPlayPress,
  onSeeAllPress,
}: ReleaseCarouselProps) {
  const toggleSave = useBookmarkStore((state) => state.toggleAlbumSave);
  const savedIds = useBookmarkStore((state) => state.savedAlbumIds);

  const renderItem = useCallback(
    ({ item }: { item: Release }) => (
      <View className="mr-3">
        <AlbumCard
          release={item}
          onPress={onReleasePress}
          onPlayPress={onPlayPress}
          onSavePress={(r) => toggleSave(r.album.id)}
          isSaved={savedIds.has(item.album.id)}
        />
      </View>
    ),
    [onReleasePress, onPlayPress, toggleSave, savedIds],
  );

  return (
    <View className="mb-3">
      <SectionHeader title="New Releases" onActionPress={onSeeAllPress} />
      {isLoading ? (
        <View className="flex-row px-5">
          {[0, 1, 2].map((key) => (
            <LoadingSkeleton key={key} width={116} height={116} borderRadius={16} style={{ marginRight: 12 }} />
          ))}
        </View>
      ) : !releases?.length ? (
        <EmptyState icon="musical-notes-outline" title="No releases yet" message="New albums and singles will show up here." />
      ) : (
        <FlashList
          data={releases}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20 }}
        />
      )}
    </View>
  );
}

export const ReleaseCarousel = memo(ReleaseCarouselBase);
