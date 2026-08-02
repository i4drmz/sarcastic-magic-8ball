import React, { memo, useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from './AnimatedPressable';
import { colors } from '@/theme';

interface AvatarProps {
  uri?: string;
  size?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  ringed?: boolean;
}

function AvatarBase({ uri, size = 64, onPress, accessibilityLabel, ringed }: AvatarProps) {
  const outerSize = ringed ? size + 6 : size;
  const trimmedUri = uri?.trim() ?? '';
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (trimmedUri) {
      console.log('[birthday-debug][avatar] Avatar received image URL', {
        uri: trimmedUri,
        accessibilityLabel,
      });
    }
  }, [trimmedUri, accessibilityLabel]);

  const showImage = Boolean(trimmedUri) && !failed;

  const placeholder = (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="bg-card border border-border items-center justify-center"
    >
      <Ionicons name="person" size={Math.round(size * 0.45)} color={colors.muted} />
    </View>
  );

  const content = (
    <View
      style={{ width: outerSize, height: outerSize, borderRadius: outerSize / 2 }}
      className={ringed ? 'items-center justify-center border-2 border-accent' : ''}
    >
      {showImage ? (
        <Image
          source={{ uri: trimmedUri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={(event) => {
            const reason = event.nativeEvent?.error ?? 'unknown image load error';
            console.warn('[birthday-debug][avatar] Image failed to load — using placeholder', {
              uri: trimmedUri,
              reason,
              accessibilityLabel,
            });
            setFailed(true);
          }}
          onLoad={() => {
            console.log('[birthday-debug][avatar] Image loaded successfully', {
              uri: trimmedUri,
              accessibilityLabel,
            });
          }}
        />
      ) : (
        placeholder
      )}
    </View>
  );

  if (!onPress) return content;

  return (
    <AnimatedPressable onPress={onPress} accessibilityLabel={accessibilityLabel} scaleTo={0.92}>
      {content}
    </AnimatedPressable>
  );
}

export const Avatar = memo(AvatarBase);
