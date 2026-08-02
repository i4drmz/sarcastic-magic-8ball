import React, { memo } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface PlaceholderScreenProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
}

/** Shared shell for tabs whose full experience is planned but not yet built. */
function PlaceholderScreenBase({ icon, title, message }: PlaceholderScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-16 h-16 rounded-full bg-card items-center justify-center mb-5">
          <Ionicons name={icon} size={28} color={colors.accent} />
        </View>
        <Text className="text-section text-primary text-center mb-2">{title}</Text>
        <Text className="text-body text-secondary text-center">{message}</Text>
      </View>
    </SafeAreaView>
  );
}

export const PlaceholderScreen = memo(PlaceholderScreenBase);
