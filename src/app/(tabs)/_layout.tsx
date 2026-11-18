import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale, usePulse } from '@/components/motion';
import { T } from '@/components/ui';
import { useRecorder } from '@/state/recorder';
import { useTheme } from '@/theme';

const TABS: { name: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'explore', label: 'Explore', icon: 'compass' },
  { name: 'challenges', label: 'Challenges', icon: 'trophy' },
  { name: 'profile', label: 'Profile', icon: 'person' },
];

export default function TabLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}
      tabBar={(props) => <TabBar {...props} />}>
      {TABS.map((t) => <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />)}
    </Tabs>
  );
}

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

function TabBar({ state, navigateToTab }: TabBarProps) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const recording = useRecorder((s) => s.status === 'recording' || s.status === 'paused');
  const current = state.routes[state.index]?.name;

  const item = (t: (typeof TABS)[number]) => (
    <TabItem
      key={t.name}
      tab={t}
      focused={current === t.name}
      onPress={() => {
        const route = state.routes.find((r) => r.name === t.name);
        if (route && current !== t.name) navigateToTab(route.key);
      }}
    />
  );

  const bar = (
    <View style={[styles.row, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {item(TABS[0])}
      {item(TABS[1])}
      <View style={styles.item}>
        {/* Same 26px icon slot as the other tabs so every label sits on one baseline. */}
        <View style={styles.iconSlot}>
          <RecordButton
            recording={recording}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              router.push('/record');
            }}
          />
        </View>
        <T v="small" color={recording ? c.danger : c.faint} style={styles.label}>{recording ? 'Live' : 'Record'}</T>
        <View style={styles.dot} />
      </View>
      {item(TABS[2])}
      {item(TABS[3])}
    </View>
  );

  return (
    <View style={[styles.wrap, { borderTopColor: c.border }]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(6,8,13,0.96)' : 'rgba(255,255,255,0.97)' }]} />
      )}
      {bar}
    </View>
  );
}

function TabItem({ tab, focused, onPress }: { tab: (typeof TABS)[number]; focused: boolean; onPress(): void }) {
  const { c } = useTheme();
  const [v] = useState(() => new Animated.Value(focused ? 1 : 0));
  useEffect(() => {
    Animated.spring(v, { toValue: focused ? 1 : 0, useNativeDriver: NATIVE, speed: 20, bounciness: 10 }).start();
  }, [focused, v]);
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={tab.label} style={styles.item}>
      <Animated.View style={[styles.iconSlot, { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) }] }]}>
        <Ionicons name={focused ? tab.icon : (`${tab.icon}-outline` as typeof tab.icon)} size={23} color={focused ? c.text : c.faint} />
      </Animated.View>
      <T v="small" color={focused ? c.text : c.faint} style={[styles.label, { fontWeight: focused ? '800' : '600' }]}>{tab.label}</T>
      <Animated.View style={[styles.dot, { backgroundColor: c.primary, opacity: v, transform: [{ scale: v }] }]} />
    </Pressable>
  );
}

function RecordButton({ recording, onPress }: { recording: boolean; onPress(): void }) {
  const { c } = useTheme();
  const glow = usePulse(recording ? 1000 : 2400);
  return (
    <PressScale onPress={onPress} scaleTo={0.9} accessibilityRole="button" accessibilityLabel={recording ? 'Return to recording' : 'Record an activity'} style={styles.recordWrap}>
      <Animated.View pointerEvents="none" style={[styles.glow, {
        backgroundColor: recording ? c.danger : c.primary,
        opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.35] }),
        transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
      }]} />
      <LinearGradient colors={recording ? ['#FF5C7A', '#FFB547'] : ['#2EE6C5', '#4DA3FF', '#7C6CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.record}>
        <Ionicons name={recording ? 'radio-button-on' : 'add'} size={recording ? 26 : 32} color="#fff" />
      </LinearGradient>
    </PressScale>
  );
}

const NATIVE = Platform.OS !== 'web';

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'visible' },
  row: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: 8, width: '100%' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3, minHeight: 52 },
  iconSlot: { height: 26, alignItems: 'center', justifyContent: 'flex-end', overflow: 'visible' },
  label: { fontSize: 10, fontWeight: '700', lineHeight: 13 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 1 },
  recordWrap: { position: 'absolute', bottom: 4, alignSelf: 'center', width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 64, height: 64, borderRadius: 32 },
  record: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', shadowColor: '#2EE6C5', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
});
