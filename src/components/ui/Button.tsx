import React, { memo } from 'react';
import { Text } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'lg';
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-primary',
  secondary: 'bg-card border border-border',
  ghost: 'bg-transparent',
};

const VARIANT_TEXT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'text-background',
  secondary: 'text-primary',
  ghost: 'text-primary',
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps['size']>, string> = {
  md: 'py-3 px-5',
  lg: 'py-4 px-6',
};

function ButtonBase({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth,
}: ButtonProps) {
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityLabel={label}
      className={`rounded-full items-center justify-center ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${
        fullWidth ? 'w-full' : 'self-start'
      }`}
    >
      <Text className={`text-body font-semibold ${VARIANT_TEXT_CLASSES[variant]}`}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export const Button = memo(ButtonBase);
