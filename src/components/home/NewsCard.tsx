import React, { memo } from 'react';
import { Image, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { News } from '@/models';
import { AnimatedPressable } from '@/components/ui';
import { colors } from '@/theme';
import { formatRelativeTime } from '@/utils/formatDate';

interface NewsCardProps {
  news: News;
  onPress?: (news: News) => void;
  onBookmarkPress?: (news: News) => void;
  isBookmarked?: boolean;
}

export const NEWS_CARD_WIDTH = 240;
export const NEWS_CARD_HEIGHT = 76;

function NewsCardBase({ news, onPress, onBookmarkPress, isBookmarked }: NewsCardProps) {
  return (
    <View
      className="flex-row items-center bg-card border border-border rounded-2xl p-2"
      style={{ width: NEWS_CARD_WIDTH, height: NEWS_CARD_HEIGHT }}
    >
      <AnimatedPressable
        onPress={() => onPress?.(news)}
        accessibilityLabel={news.headline}
        style={{ flex: 1, height: '100%' }}
      >
        <View className="flex-row items-center h-full">
          <Image source={{ uri: news.imageUrl }} style={{ width: 56, height: 56, borderRadius: 12 }} resizeMode="cover" />
          <View className="ml-2.5 flex-1 justify-center">
            <Text className="text-[12px] font-semibold text-primary leading-[15px]" numberOfLines={2}>
              {news.headline}
            </Text>
            <Text className="text-[10px] text-muted mt-1" numberOfLines={1}>
              {news.source.name} · {formatRelativeTime(news.publishedAt)}
            </Text>
          </View>
        </View>
      </AnimatedPressable>
      <AnimatedPressable
        onPress={() => onBookmarkPress?.(news)}
        accessibilityLabel="Bookmark article"
        scaleTo={0.85}
        haptic={false}
        style={{ paddingLeft: 6 }}
      >
        <Ionicons
          name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
          size={14}
          color={isBookmarked ? colors.accent : colors.muted}
        />
      </AnimatedPressable>
    </View>
  );
}

export const NewsCard = memo(NewsCardBase);
