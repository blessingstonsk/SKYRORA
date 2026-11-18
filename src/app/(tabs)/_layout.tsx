import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

  const item = (t: (typeof TABS)[number]) => {
    const focused = current === t.name;
    return (
      <Pressable
        key={t.name}
        onPress={() => {
          const route = state.routes.find((r) => r.name === t.name);
          if (!route) return;
          if (!focused) navigateToTab(route.key);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={t.label}
        style={styles.item}>
        <Ionicons name={focused ? t.icon : (`${t.icon}-outline` as typeof t.icon)} size={23} color={focused ? c.text : c.faint} />
        <T v="small" color={focused ? c.text : c.faint} style={{ fontSize: 10, fontWeight: focused ? '800' : '600' }}>{t.label}</T>
      </Pressable>
    );
  };

  const bar = (
    <View style={[styles.row, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {item(TABS[0])}
      {item(TABS[1])}
      <View style={styles.item}>
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push('/record');
          }}
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Return to recording' : 'Record an activity'}
          style={({ pressed }) => [styles.recordWrap, { transform: [{ scale: pressed ? 0.94 : 1 }], shadowColor: c.primary }]}>
          <LinearGradient colors={recording ? ['#FF5C7A', '#FFB547'] : ['#2EE6C5', '#4DA3FF', '#7C6CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.record}>
            <Ionicons name={recording ? 'radio-button-on' : 'add'} size={recording ? 26 : 32} color="#fff" />
          </LinearGradient>
        </Pressable>
        <T v="small" color={recording ? c.danger : c.faint} style={{ fontSize: 10, fontWeight: '700', marginTop: 2 }}>{recording ? 'Live' : 'Record'}</T>
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

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'visible' },
  row: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: 8, maxWidth: 640, width: '100%', alignSelf: 'center' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 3, minHeight: 48 },
  recordWrap: { marginTop: -28, borderRadius: 34, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  record: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
