import { cssInterop } from 'nativewind';
import * as React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { cn } from '@/lib/utils';

type TextVariant =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'heading'
  | 'body'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption1'
  | 'caption2';

type TextColorVariant = 'primary' | 'secondary' | 'tertiary' | 'quarternary';

type TextVariantProps = {
  variant?: TextVariant;
  color?: TextColorVariant;
};

cssInterop(RNText, { className: 'style' });

const TEXT_VARIANT_CLASS: Record<TextVariant, string> = {
  largeTitle: 'text-4xl',
  title1: 'text-2xl',
  title2: 'text-[22px] leading-7',
  title3: 'text-xl',
  heading: 'text-[17px] leading-6 font-semibold',
  body: 'text-[17px] leading-6',
  callout: 'text-base',
  subhead: 'text-[15px] leading-6',
  footnote: 'text-[13px] leading-5',
  caption1: 'text-xs',
  caption2: 'text-[11px] leading-4',
};

const TEXT_COLOR_CLASS: Record<TextColorVariant, string> = {
  primary: '',
  secondary: 'text-secondary-foreground/90',
  tertiary: 'text-muted-foreground/90',
  quarternary: 'text-muted-foreground/50',
};

const textVariants = ({
  variant = 'body',
  color = 'primary',
  className,
}: TextVariantProps & { className?: string }): string =>
  cn('text-foreground', TEXT_VARIANT_CLASS[variant], TEXT_COLOR_CLASS[color], className);

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  variant = 'body',
  color = 'primary',
  ...props
}: RNTextProps & TextVariantProps) {
  const textClassName = React.useContext(TextClassContext);
  return <RNText className={cn(textVariants({ variant, color }), textClassName, className)} {...props} />;
}

export { Text, TextClassContext, textVariants };
