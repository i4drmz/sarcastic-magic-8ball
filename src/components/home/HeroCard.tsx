import React, { memo } from 'react';
import { Image, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import type { News } from '@/models';
import { AnimatedPressable, Badge, IconButton, LoadingSkeleton } from '@/components/ui';
import { colors, gradients } from '@/theme';
import { HERO_MIN_HEIGHT, HERO_MAX_HEIGHT, SCREEN_HORIZONTAL_PADDING } from '@/constants/layout';

interface HeroCardProps {
  news?: News;
  isLoading?: boolean;
  scrollY?: SharedValue<number>;
  scrollOffsetStart?: number;
  onReadMore?: (news: News) => void;
  onBookmark?: (news: News) => void;
  onShare?: (news: News) => void;
  isBookmarked?: boolean;
}

const CATEGORY_LABELS: Record<News['category'], string> = {
  comeback: 'Comeback',
  award: 'Award',
  concert: 'Concert',
  variety: 'Variety',
  chart: 'Chart',
  industry: 'Industry',
  exclusive: 'Exclusive',
};

function HeroCardBase({
  news,
  isLoading,
  scrollY,
  scrollOffsetStart = 0,
  onReadMore,
  onBookmark,
  onShare,
  isBookmarked,
}: HeroCardProps) {
  const { width } = useWindowDimensions();

  const parallaxStyle = useAnimatedStyle(() => {
    'worklet';
    if (!scrollY) return {};
    // Kept subtle (small translate range) since the image now fills a
    // flex-sized container rather than a fixed height with overflow buffer.
    const translateY = interpolate(
      scrollY.value,
      [scrollOffsetStart - 200, scrollOffsetStart + HERO_MIN_HEIGHT],
      [-12, 12],
      'clamp',
    );
    const scale = interpolate(
      scrollY.value,
      [scrollOffsetStart - 200, scrollOffsetStart],
      [1.12, 1],
      'clamp',
    );
    return { transform: [{ translateY }, { scale }] };
  });

  if (isLoading || !news) {
    return (
      <View className="mx-5 mb-4" style={{ flex: 1, minHeight: HERO_MIN_HEIGHT, maxHeight: HERO_MAX_HEIGHT }}>
        <LoadingSkeleton width="100%" borderRadius={24} style={{ flex: 1 }} />
      </View>
    );
  }

  const cardWidth = width - SCREEN_HORIZONTAL_PADDING * 2;

  return (
    <View
      className="mx-5 mb-4 rounded-card overflow-hidden bg-card"
      style={{ flex: 1, minHeight: HERO_MIN_HEIGHT, maxHeight: HERO_MAX_HEIGHT }}
    >
      <Animated.View style={[{ width: cardWidth, flex: 1 }, parallaxStyle]}>
        <Image source={{ uri: news.imageUrl }} style={{ width: cardWidth, height: '100%' }} resizeMode="cover" />
      </Animated.View>
      <LinearGradient
        colors={gradients.heroOverlay}
        style={{ position: 'absolute', inset: 0 }}
      />
      <View className="absolute top-5 left-5 right-5 flex-row items-center justify-between">
        <Badge label={CATEGORY_LABELS[news.category]} />
        <View className="flex-row gap-2.5">
          <IconButton
            icon={
              <Ionicons
                name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                size={17}
                color={colors.primary}
              />
            }
            onPress={() => onBookmark?.(news)}
            accessibilityLabel="Bookmark"
            size={38}
          />
          <IconButton
            icon={<Ionicons name="share-outline" size={17} color={colors.primary} />}
            onPress={() => onShare?.(news)}
            accessibilityLabel="Share"
            size={38}
          />
        </View>
      </View>
      <View className="absolute bottom-0 left-0 right-0 p-5">
        {news.relatedArtistIds?.length ? (
          <Text className="text-caption font-semibold text-accent uppercase tracking-wide mb-1.5">
            {news.source.name}
          </Text>
        ) : null}
        <Text className="text-hero text-primary mb-1.5" numberOfLines={1}>
          {news.headline}
        </Text>
        <Text className="text-body text-secondary mb-3" numberOfLines={1}>
          {news.summary}
        </Text>
        <AnimatedPressable onPress={() => onReadMore?.(news)} accessibilityLabel="Read more">
          <View className="flex-row items-center self-start bg-primary rounded-full pl-4 pr-3.5 py-2.5">
            <Text className="text-body font-semibold text-background mr-1.5">Read More</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.background} />
          </View>
        </AnimatedPressable>
      </View>
    </View>
  );
}

export const HeroCard = memo(HeroCardBase);
