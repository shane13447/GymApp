import { PropsWithChildren, ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function Collapsible({ children, title }: PropsWithChildren & { title: string | ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useColorScheme() ?? 'light';

  return (
    <ThemedView>
      <Pressable
        onPress={() => setIsOpen((value) => !value)}
        className="flex-row items-start gap-1.5"
      >
        {({ pressed }) => (
          <View className={pressed ? 'opacity-70' : ''} style={{ flex: 1 }}>
            <View className="flex-row items-start gap-1.5">
              <IconSymbol
                name="chevron.right"
                size={18}
                weight="medium"
                color={theme === 'light' ? Colors.light.icon : Colors.dark.icon}
                style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }], marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                {typeof title === 'string' ? (
                  <ThemedText type="defaultSemiBold">{title}</ThemedText>
                ) : (
                  title
                )}
              </View>
            </View>
          </View>
        )}
      </Pressable>
      {isOpen && <ThemedView className="mt-1.5 ml-6">{children}</ThemedView>}
    </ThemedView>
  );
}
