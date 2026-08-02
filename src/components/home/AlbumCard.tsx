import React, { memo } from 'react';
import { Image, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Release } from '@/models';
import { AnimatedPressable } from '@/components/ui';
import { colors } from '@/theme';

interface AlbumCardProps {
  release: Release;
  onPress?: (release: Release) => void;
  onPlayPress?: (release: Release) => void;
  onSavePress?: (release: Release) => void;
  isSaved?: boolean;
}

const CARD_WIDTH = 116;

function AlbumCardBase({ release, onPress, onPlayPress, onSavePress, isSaved }: AlbumCardProps) {
  const { album } = release;

  return (
    <View style={{ width: CARD_WIDTH }}>
      <View className="rounded-2xl overflow-hidden mb-2" style={{ width: CARD_WIDTH, height: CARD_WIDTH }}>
        <AnimatedPressable
          onPress={() => onPress?.(release)}
          accessibilityLabel={`${album.title} by ${album.artistName}`}
          haptic={false}
        >
          <Image source={{ uri: album.coverUrl }} style={{ width: CARD_WIDTH, height: CARD_WIDTH }} resizeMode="cover" />
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => onPlayPress?.(release)}
          accessibilityLabel={`Play ${album.title}`}
          scaleTo={0.85}
          style={{ position: 'absolute', bottom: 6, right: 6 }}
        >
          <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
            <Ionicons name="play" size={12} color={colors.background} style={{ marginLeft: 1.5 }} />
          </View>
        </AnimatedPressable>
      </View>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-1.5">
          <Text className="text-caption font-semibold text-primary" numberOfLines={1}>
            {album.title}
          </Text>
          <Text className="text-[11px] text-secondary mt-0.5" numberOfLines={1}>
            {album.artistName}
          </Text>
        </View>
        <AnimatedPressable
          onPress={() => onSavePress?.(release)}
          accessibilityLabel={`Save ${album.title}`}
          scaleTo={0.85}
        >
          <Ionicons
            name={isSaved ? 'bookmark' : 'bookmark-outline'}
            size={14}
            color={isSaved ? colors.accent : colors.muted}
          />
        </AnimatedPressable>
      </View>
    </View>
  );
}

export const AlbumCard = memo(AlbumCardBase);
