import React, { memo } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconButton } from '@/components/ui';
import { colors } from '@/theme';

interface HomeHeaderProps {
  greeting: string;
  onSearchPress?: () => void;
  onNotificationsPress?: () => void;
  hasUnreadNotifications?: boolean;
}

/**
 * Premium large-title header, matching the original design language. Sized
 * intrinsically (padding + text line-height) rather than a fixed pixel
 * constant, so it never reserves more space than the greeting actually needs.
 */
function HomeHeaderBase({
  greeting,
  onSearchPress,
  onNotificationsPress,
  hasUnreadNotifications,
}: HomeHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-5 pt-1.5 pb-3">
      <Text className="text-hero text-primary flex-1 pr-3" numberOfLines={1}>
        {greeting}
      </Text>
      <View className="flex-row items-center gap-2.5">
        <IconButton
          icon={<Ionicons name="search" size={18} color={colors.primary} />}
          onPress={onSearchPress}
          accessibilityLabel="Search"
          size={40}
        />
        <IconButton
          icon={<Ionicons name="notifications" size={18} color={colors.primary} />}
          onPress={onNotificationsPress}
          accessibilityLabel="Notifications"
          showDot={hasUnreadNotifications}
          size={40}
        />
      </View>
    </View>
  );
}

export const HomeHeader = memo(HomeHeaderBase);
