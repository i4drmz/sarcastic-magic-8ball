import React, { memo, useCallback, useEffect } from 'react';
import { Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { Birthday } from '@/models';
import { Avatar, LoadingSkeleton } from '@/components/ui';

interface BirthdayRowProps {
  birthdays?: Birthday[];
  isLoading?: boolean;
  onBirthdayPress?: (birthday: Birthday) => void;
}

const AVATAR_SIZE = 48;
/** FlashList needs a bounded cross-axis size for horizontal lists. */
const ROW_HEIGHT = 88;

function BirthdayItem({ birthday, onPress }: { birthday: Birthday; onPress?: (b: Birthday) => void }) {
  useEffect(() => {
    console.log('[birthday-debug][8-row-item] Rendering birthday item', {
      id: birthday.id,
      name: birthday.name,
      groupName: birthday.groupName,
      birthDate: birthday.birthDate,
      avatarUrl: birthday.avatarUrl || '(empty — placeholder)',
      hasImage: Boolean(birthday.avatarUrl),
    });
  }, [birthday]);

  return (
    <View className="items-center mr-4" style={{ width: 72 }}>
      <Avatar
        uri={birthday.avatarUrl}
        size={AVATAR_SIZE}
        ringed
        onPress={() => onPress?.(birthday)}
        accessibilityLabel={`Open ${birthday.name}'s profile`}
      />
      <Text className="text-[11px] font-medium text-primary mt-1 text-center" numberOfLines={1}>
        {birthday.name}
      </Text>
      {birthday.groupName ? (
        <Text className="text-[10px] text-muted text-center" numberOfLines={1}>
          {birthday.groupName}
        </Text>
      ) : null}
    </View>
  );
}

function BirthdayRowBase({ birthdays, isLoading, onBirthdayPress }: BirthdayRowProps) {
  useEffect(() => {
    console.log('[birthday-debug][8-row] BirthdayRow received props', {
      isLoading,
      count: birthdays?.length ?? 0,
      names: birthdays?.map((b) => b.name) ?? [],
    });
  }, [birthdays, isLoading]);

  const renderItem = useCallback(
    ({ item }: { item: Birthday }) => <BirthdayItem birthday={item} onPress={onBirthdayPress} />,
    [onBirthdayPress],
  );

  return (
    <View className="mb-2">
      <Text className="text-caption text-muted uppercase tracking-wide px-5 mb-1">Today's Birthdays</Text>
      {isLoading ? (
        <View className="flex-row px-5">
          {[0, 1, 2, 3, 4].map((key) => (
            <LoadingSkeleton
              key={key}
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              borderRadius={AVATAR_SIZE / 2}
              style={{ marginRight: 16 }}
            />
          ))}
        </View>
      ) : !birthdays?.length ? (
        <Text className="text-caption text-muted px-5 py-2">No birthdays today.</Text>
      ) : (
        <View style={{ height: ROW_HEIGHT }}>
          <FlashList
            data={birthdays}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
          />
        </View>
      )}
    </View>
  );
}

export const BirthdayRow = memo(BirthdayRowBase);
