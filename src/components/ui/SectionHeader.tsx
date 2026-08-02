import React, { memo } from 'react';
import { Text, View } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

function SectionHeaderBase({ title, actionLabel = 'See All', onActionPress }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-5 mb-2.5">
      <Text className="text-section text-primary">{title}</Text>
      {onActionPress ? (
        <AnimatedPressable onPress={onActionPress} accessibilityLabel={`${actionLabel} ${title}`} haptic={false}>
          <Text className="text-body font-medium text-secondary">{actionLabel}</Text>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

export const SectionHeader = memo(SectionHeaderBase);
