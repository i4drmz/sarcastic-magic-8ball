import React, { memo } from 'react';
import { Text, View } from 'react-native';

interface BadgeProps {
  label: string;
  tone?: 'accent' | 'neutral' | 'success' | 'warning';
}

const TONE_CLASSES: Record<NonNullable<BadgeProps['tone']>, string> = {
  accent: 'bg-accent/90',
  neutral: 'bg-white/10',
  success: 'bg-success/90',
  warning: 'bg-warning/90',
};

function BadgeBase({ label, tone = 'accent' }: BadgeProps) {
  return (
    <View className={`self-start rounded-full px-3 py-1.5 ${TONE_CLASSES[tone]}`}>
      <Text className="text-caption font-semibold text-primary uppercase tracking-wide">
        {label}
      </Text>
    </View>
  );
}

export const Badge = memo(BadgeBase);
