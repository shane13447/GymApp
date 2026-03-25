import { ExpoConfig, ConfigContext } from 'expo/config';

const IS_DEV = process.env.APP_VARIANT === 'development';
const COACH_PROXY_URL = process.env.EXPO_PUBLIC_COACH_PROXY_URL ?? '';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? 'Dev' : 'Shanes Gym App',
  slug: 'Shanes-gym-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'shanesgymapp',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    ...config.ios,
    supportsTablet: true,
    bundleIdentifier: IS_DEV ? 'com.anonymous.Shanesgymapp.dev' : 'com.anonymous.Shanesgymapp',
  },
  // Expo supports these Android fields; the TypeScript type may lag behind.
  android: ({
    ...config.android,
    package: IS_DEV ? 'com.anonymous.Shanesgymapp.dev' : 'com.anonymous.Shanesgymapp',
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
      backgroundColor: '#E6F4FE',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
  } as any),
  web: {
    favicon: './assets/images/favicon.png',
    output: 'static',
  },
  plugins: [
    'expo-router',
    'expo-web-browser',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: {
          backgroundColor: '#000000',
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    ...config.extra,
    coachProxyUrl: COACH_PROXY_URL,
    supabaseUrl: SUPABASE_URL,
    supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY,
  },
});
