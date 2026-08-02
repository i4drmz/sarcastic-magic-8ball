import React, { memo, useCallback, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import type { ChartSource } from '@/models';
import { AnimatedPressable } from '@/components/ui';

interface ChartTabsProps {
  tabs: { id: ChartSource; label: string }[];
  activeTab: ChartSource;
  onTabChange: (tab: ChartSource) => void;
}

interface TabLayout {
  x: number;
  width: number;
}

function ChartTabsBase({ tabs, activeTab, onTabChange }: ChartTabsProps) {
  const [layouts, setLayouts] = useState<Record<string, TabLayout>>({});
  const activeLayout = layouts[activeTab];

  const pillStyle = useAnimatedStyle(() => {
    if (!activeLayout) return { opacity: 0 };
    return {
      opacity: 1,
      transform: [{ translateX: withTiming(activeLayout.x, { duration: 250 }) }],
      width: withTiming(activeLayout.width, { duration: 250 }),
    };
  }, [activeLayout]);

  const handleLayout = useCallback((id: string, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => ({ ...prev, [id]: { x, width } }));
  }, []);

  return (
    <View className="mx-5 mb-5 flex-row bg-card rounded-full p-1 border border-border">
      <Animated.View
        style={[pillStyle, { position: 'absolute', top: 4, bottom: 4, borderRadius: 999 }]}
        className="bg-white/10"
      />
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <AnimatedPressable
            key={tab.id}
            onPress={() => onTabChange(tab.id)}
            accessibilityLabel={tab.label}
            haptic
            scaleTo={0.97}
            style={{ flex: 1 }}
          >
            <View
              onLayout={(e) => handleLayout(tab.id, e)}
              className="py-2.5 items-center justify-center rounded-full"
            >
              <Text
                className={`text-caption font-semibold ${isActive ? 'text-primary' : 'text-muted'}`}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </View>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

export const ChartTabs = memo(ChartTabsBase);
