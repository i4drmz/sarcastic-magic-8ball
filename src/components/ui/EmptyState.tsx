import React, { memo } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
}

function EmptyStateBase({ icon = 'sparkles-outline', title, message }: EmptyStateProps) {
  return (
    <View className="items-center justify-center py-10 px-6">
      <View className="w-14 h-14 rounded-full bg-card items-center justify-center mb-4">
        <Ionicons name={icon} size={24} color={colors.muted} />
      </View>
      <Text className="text-card-title text-primary text-center mb-1">{title}</Text>
      {message ? (
        <Text className="text-body text-secondary text-center">{message}</Text>
      ) : null}
    </View>
  );
}

export const EmptyState = memo(EmptyStateBase);
