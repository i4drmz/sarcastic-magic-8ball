import React, { memo } from 'react';
import { Pressable } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface AnimatedPressableProps {
  onPress?: () => void;
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  hitSlop?: number;
}

/**
 * Shared press interaction used across cards and buttons: a subtle scale-down
 * with a light haptic tick, matching the "cards lift slightly" spec.
 */
function AnimatedPressableBase({
  onPress,
  children,
  className,
  style,
  scaleTo = 0.96,
  haptic = true,
  disabled,
  accessibilityLabel,
  hitSlop,
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(scaleTo, { duration: 120 });
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 150 });
  };

  const handlePress = () => {
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={hitSlop}
        className={className}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export const AnimatedPressable = memo(AnimatedPressableBase);
