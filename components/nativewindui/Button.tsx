import { Platform, Pressable, type PressableProps, View } from 'react-native';

import { TextClassContext } from '@/components/nativewindui/Text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'plain';
type ButtonSize = 'none' | 'sm' | 'md' | 'lg' | 'icon';

type ButtonVariantProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

type AndroidOnlyButtonProps = {
  /**
   * ANDROID ONLY: The class name of root responsible for hiding ripple overflow.
   */
  androidRootClassName?: string;
};

type ButtonProps = PressableProps & ButtonVariantProps & AndroidOnlyButtonProps;

const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'ios:active:opacity-80 bg-primary',
  secondary: 'ios:border-primary ios:active:bg-primary/5 border border-foreground/40',
  tonal: 'ios:bg-primary/10 dark:ios:bg-primary/10 ios:active:bg-primary/15 bg-primary/15 dark:bg-primary/30',
  plain: 'ios:active:opacity-70',
};

const BUTTON_SIZE_CLASS: Record<ButtonSize, string> = {
  none: '',
  sm: 'py-1 px-2.5 rounded-full',
  md: 'ios:rounded-lg py-2 ios:py-1.5 ios:px-3.5 px-5 rounded-full',
  lg: 'py-2.5 px-5 ios:py-2 rounded-xl gap-2',
  icon: 'ios:rounded-lg h-10 w-10 rounded-full',
};

const BUTTON_TEXT_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'ios:text-primary text-foreground',
  tonal: 'ios:text-primary text-foreground',
  plain: 'text-foreground',
};

const BUTTON_TEXT_SIZE_CLASS: Record<ButtonSize, string> = {
  none: '',
  icon: '',
  sm: 'text-[15px] leading-5',
  md: 'text-[17px] leading-7',
  lg: 'text-[17px] leading-7',
};

const ANDROID_ROOT_SIZE_CLASS: Record<ButtonSize, string> = {
  none: '',
  icon: 'rounded-full',
  sm: 'rounded-full',
  md: 'rounded-full',
  lg: 'rounded-xl',
};

/**
 * Compute the Android ripple color for a button variant and color scheme.
 *
 * @param {ButtonVariant} variant - The button visual variant.
 * @param {'light' | 'dark'} colorScheme - The active color scheme.
 * @returns {string} An rgba ripple color string.
 */
const getAndroidRippleColor = (variant: ButtonVariant, colorScheme: 'light' | 'dark'): string => {
  if (colorScheme === 'dark') {
    switch (variant) {
      case 'primary':
        return 'rgba(255, 255, 255, 0.25)';
      case 'secondary':
      case 'tonal':
      case 'plain':
      default:
        return 'rgba(255, 255, 255, 0.16)';
    }
  }

  switch (variant) {
    case 'primary':
      return 'rgba(0, 0, 0, 0.18)';
    case 'secondary':
    case 'tonal':
    case 'plain':
    default:
      return 'rgba(0, 0, 0, 0.12)';
  }
};

/**
 * Build the container className for a button from its variant, size, and extra
 * className.
 *
 * @param {ButtonVariantProps} props - The variant, size, and optional className.
 * @returns {string} The composed className string.
 */
const buttonVariants = ({ variant = 'primary', size = 'md', className }: ButtonVariantProps): string =>
  cn('flex-row items-center justify-center gap-2', BUTTON_VARIANT_CLASS[variant], BUTTON_SIZE_CLASS[size], className);

/**
 * Build the text className for a button label from its variant and size.
 *
 * @param {Omit<ButtonVariantProps, 'className'>} props - The variant and size.
 * @returns {string} The composed text className string.
 */
const buttonTextVariants = ({ variant = 'primary', size = 'md' }: Omit<ButtonVariantProps, 'className'>): string =>
  cn('font-medium', BUTTON_TEXT_VARIANT_CLASS[variant], BUTTON_TEXT_SIZE_CLASS[size]);

/**
 * Themed pressable button that applies variant/size styling and a platform-
 * appropriate Android ripple, providing its text styling to descendants via
 * context.
 *
 * @param {ButtonProps} props - Button props including `variant`, `size`, `androidRootClassName`, and `android_ripple`.
 * @returns {React.ReactElement} The button element.
 */
function Button({
  className,
  variant = 'primary',
  size = 'md',
  androidRootClassName,
  android_ripple,
  ...props
}: ButtonProps) {
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';

  const resolvedAndroidRipple =
    Platform.OS === 'android'
      ? android_ripple ?? { color: getAndroidRippleColor(variant, colorScheme), borderless: false }
      : undefined;

  const button = (
    <Pressable
      {...props}
      className={cn(props.disabled && 'opacity-50', buttonVariants({ variant, size, className }))}
      android_ripple={resolvedAndroidRipple}
    />
  );

  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      {Platform.OS === 'android' ? (
        <View className={cn('overflow-hidden', ANDROID_ROOT_SIZE_CLASS[size], androidRootClassName)}>
          {button}
        </View>
      ) : (
        button
      )}
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
