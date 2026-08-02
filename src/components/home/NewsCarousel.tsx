import React, { memo, useCallback } from 'react';
import { Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { News } from '@/models';
import { NewsCard, NEWS_CARD_WIDTH, NEWS_CARD_HEIGHT } from './NewsCard';
import { LoadingSkeleton, EmptyState } from '@/components/ui';
import { useBookmarkStore } from '@/store/useBookmarkStore';

interface NewsCarouselProps {
  news?: News[];
  isLoading?: boolean;
  onNewsPress?: (news: News) => void;
}

function NewsCarouselBase({ news, isLoading, onNewsPress }: NewsCarouselProps) {
  const toggleBookmark = useBookmarkStore((state) => state.toggleNewsBookmark);
  const bookmarkedIds = useBookmarkStore((state) => state.bookmarkedNewsIds);

  const renderItem = useCallback(
    ({ item }: { item: News }) => (
      <View className="mr-2.5">
        <NewsCard
          news={item}
          onPress={onNewsPress}
          onBookmarkPress={(n) => toggleBookmark(n.id)}
          isBookmarked={bookmarkedIds.has(item.id)}
        />
      </View>
    ),
    [onNewsPress, toggleBookmark, bookmarkedIds],
  );

  return (
    <View>
      <Text className="text-caption text-muted uppercase tracking-wide px-5 mb-1">Trending News</Text>
      <View style={{ height: NEWS_CARD_HEIGHT }}>
        {isLoading ? (
          <View className="flex-row px-5">
            {[0, 1, 2].map((key) => (
              <LoadingSkeleton
                key={key}
                width={NEWS_CARD_WIDTH}
                height={NEWS_CARD_HEIGHT}
                borderRadius={16}
                style={{ marginRight: 10 }}
              />
            ))}
          </View>
        ) : !news?.length ? (
          <View className="px-5">
            <EmptyState icon="newspaper-outline" title="No news yet" />
          </View>
        ) : (
          <FlashList
            data={news}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
          />
        )}
      </View>
    </View>
  );
}

export const NewsCarousel = memo(NewsCarouselBase);
