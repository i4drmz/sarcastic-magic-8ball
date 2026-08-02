import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BOTTOM_TAB_BAR_HEIGHT } from '@/constants/layout';

interface BottomTabBarProps {
  children: React.ReactNode;
}

/**
 * Visual shell for the bottom navigation. Must receive the `TabTrigger`
 * elements directly as `children` (not rendered by a nested component) so
 * Expo Router's headless `<Tabs>` can statically discover the route triggers.
 */
export function BottomTabBar({ children }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container} pointerEvents="box-none">
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={StyleSheet.absoluteFill} className="bg-background/40 border-t border-border" />
      <View
        style={[
          styles.row,
          { height: BOTTOM_TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
});
