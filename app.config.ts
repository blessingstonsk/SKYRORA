import type { ConfigContext, ExpoConfig } from 'expo/config';

// Dynamic config so secrets (Maps key) come from the environment, never the repo.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SKYRO',
  slug: 'skyro',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'skyro',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#06080D',
  ios: {
    bundleIdentifier: 'app.skyro.mobile',
    supportsTablet: false,
    icon: './assets/expo.icon',
    infoPlist: {
      UIBackgroundModes: ['location'],
      NSMotionUsageDescription: 'SKYRO counts your steps during walks and runs.',
    },
  },
  android: {
    package: 'app.skyro.mobile',
    adaptiveIcon: {
      backgroundColor: '#06080D',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['ACTIVITY_RECOGNITION', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION'],
    predictiveBackGestureEnabled: false,
  },
  web: { output: 'single', favicon: './assets/images/favicon.png', bundler: 'metro' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    ['expo-splash-screen', { backgroundColor: '#06080D', image: './assets/images/splash-icon.png', imageWidth: 76 }],
    ['expo-location', {
      locationAlwaysAndWhenInUsePermission: 'SKYRO records your route in the background while an activity is running, even with the screen off.',
      locationWhenInUsePermission: 'SKYRO uses your location to record routes, distance and pace.',
      isIosBackgroundLocationEnabled: true,
      isAndroidBackgroundLocationEnabled: true,
      isAndroidForegroundServiceEnabled: true,
    }],
    ['expo-image-picker', { photosPermission: 'SKYRO lets you add photos to your activities and profile.', cameraPermission: false }],
    ['expo-sensors', { motionPermission: 'SKYRO counts your steps during walks and runs.' }],
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_KEY }],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
});
