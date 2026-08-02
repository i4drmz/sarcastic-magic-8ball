import React, { forwardRef, memo, useEffect } from 'react';
import { Pressable, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors } from '@/theme';
import type { TabConfig } from '@/constants/tabs';

interface TabBarButtonProps {
  tab: TabConfig;
  isFocused?: boolean;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Rendered as the `asChild` target of an Expo Router `TabTrigger`, which
 * injects `isFocused` / `onPress` / `onLongPress` at render time.
 */
export const TabBarButton = memo(
  forwardRef<View, TabBarButtonProps>(function TabBarButton(
    { tab, isFocused, onPress, onLongPress, style },
    ref,
  ) {
    const progress = useSharedValue(isFocused ? 1 : 0);

    useEffect(() => {
      progress.value = withSpring(isFocused ? 1 : 0, { damping: 16, stiffness: 180 });
    }, [isFocused, progress]);

    const pillStyle = useAnimatedStyle(() => ({
      opacity: progress.value,
      transform: [{ scale: 0.6 + progress.value * 0.4 }],
    }));

    const iconStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: progress.value * -1 }],
    }));

    const handlePress = (e: GestureResponderEvent) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress?.(e);
    };

    return (
      <Pressable
        ref={ref}
        onPress={handlePress}
        onLongPress={onLongPress}
        style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, style]}
        accessibilityRole="tab"
        accessibilityState={{ selected: !!isFocused }}
        accessibilityLabel={tab.accessibilityLabel}
      >
        <View className="items-center justify-center" style={{ height: 40, width: 52 }}>
          <Animated.View
            style={[pillStyle, { position: 'absolute', width: 52, height: 32, borderRadius: 16 }]}
            className="bg-white/10"
          />
          <Animated.View style={iconStyle}>
            <Ionicons
              name={isFocused ? tab.activeIcon : tab.inactiveIcon}
              size={22}
              color={isFocused ? colors.primary : colors.muted}
            />
          </Animated.View>
        </View>
      </Pressable>
    );
  }),
);
