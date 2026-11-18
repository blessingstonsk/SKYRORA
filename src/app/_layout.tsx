import '@/lib/tracker'; // registers the background location task at startup

import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { invalidateActivityData } from '@/data/hooks';
import { flushOutbox, loadOutbox, watchConnectivity } from '@/data/outbox';
import { AuthProvider, useAccountState } from '@/state/auth';
import { useRecorder } from '@/state/recorder';
import { ThemeProvider, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

// React Query: pause network work while offline, refetch on foreground.
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)));
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
}

const AUTH_SCREENS = ['welcome', 'sign-in', 'sign-up', 'forgot-password'];
/** Phone-width column on tablets and the web, so layouts never stretch. */
const APP_MAX_WIDTH = 560;

export default function RootLayout() {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 2, staleTime: 20_000, gcTime: 10 * 60_000 }, mutations: { retry: 0 } },
  }));
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={qc}>
            <AuthProvider>
              <Boot qc={qc} />
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Boot({ qc }: { qc: QueryClient }) {
  const { c, isDark } = useTheme();
  const { loading, signedIn, onboarded } = useAccountState();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  // Deterministic routing on auth changes (the Stack.Protected guards below enforce access).
  const segments = useSegments();
  const router = useRouter();
  // On app start and after sign-out, land on Welcome (not whichever auth screen the guard falls back to).
  const needWelcome = useRef(true);
  useEffect(() => {
    if (loading) return;
    const first = segments[0] as string | undefined;
    const inAuth = !!first && AUTH_SCREENS.includes(first);
    if (!signedIn) {
      if (first === 'auth-callback') return;
      if (first === 'welcome') needWelcome.current = false;
      else if (!inAuth || needWelcome.current) {
        // Defer one tick so the navigator has mounted before we redirect.
        const t = setTimeout(() => router.replace('/welcome'), 0);
        return () => clearTimeout(t);
      }
      return;
    }
    needWelcome.current = true;
    if (!onboarded && first !== 'onboarding') router.replace('/onboarding');
    else if (onboarded && (inAuth || first === 'onboarding')) router.replace('/');
  }, [loading, signedIn, onboarded, segments, router]);

  useEffect(() => {
    if (!signedIn) return;
    useRecorder.getState().restore();
    loadOutbox().then(() => flushOutbox()).then((m) => { if (m.size) invalidateActivityData(qc); });
    return watchConnectivity(() => invalidateActivityData(qc));
  }, [signedIn, qc]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#030407' : '#E6EAF1' }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ flex: 1, width: '100%', maxWidth: APP_MAX_WIDTH, alignSelf: 'center', backgroundColor: c.bg, overflow: 'hidden' }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="record" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="activity/finish" options={{ gestureEnabled: false }} />
          <Stack.Screen name="activity/log" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="goals" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          {/* Every app screen must be declared here: undeclared routes bypass the auth guard. */}
          {['activity/[id]', 'challenge/[id]', 'user/[id]', 'weight', 'analytics', 'records', 'leaderboard', 'notifications', 'settings', 'edit-profile', 'activities'].map((name) => (
            <Stack.Screen key={name} name={name} />
          ))}
        </Stack.Protected>
        <Stack.Screen name="auth-callback" />
      </Stack>
      </View>
    </View>
  );
}
