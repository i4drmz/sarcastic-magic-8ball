import React, { memo } from 'react';
import { View } from 'react-native';
import { BlurView } from 'expo-blur';
import { AnimatedPressable } from './AnimatedPressable';

interface IconButtonProps {
  icon: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: number;
  variant?: 'blur' | 'solid';
  showDot?: boolean;
}

function IconButtonBase({
  icon,
  onPress,
  accessibilityLabel,
  size = 44,
  variant = 'blur',
  showDot = false,
}: IconButtonProps) {
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={dimensionStyle}
      scaleTo={0.9}
    >
      {variant === 'blur' ? (
        <BlurView
          intensity={40}
          tint="dark"
          style={dimensionStyle}
          className="items-center justify-center overflow-hidden border border-border"
        >
          {icon}
        </BlurView>
      ) : (
        <View
          style={dimensionStyle}
          className="items-center justify-center bg-card border border-border"
        >
          {icon}
        </View>
      )}
      {showDot ? (
        <View className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-accent border border-background" />
      ) : null}
    </AnimatedPressable>
  );
}

export const IconButton = memo(IconButtonBase);
