import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Alert } from '@/lib/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/route-map';
import { useSafeKeepAwake } from '@/hooks/use-safe-keep-awake';
import { ACTIVITY_COLORS, IconButton, Row, T, type MciName } from '@/components/ui';
import { api } from '@/data';
import { useMe } from '@/data/hooks';
import { estimateCalories } from '@/lib/calories';
import { ACTIVITY_META, duration, int, km, pace, speedKmh } from '@/lib/format';
import { currentSpeed } from '@/lib/geo';
import { batteryEstimate, isTracking, startGpsPreview, startTracking, stopTracking } from '@/lib/tracker';
import type { ActivityType } from '@/lib/types';
import { movingMsNow, useRecorder, type GpsStatus } from '@/state/recorder';
import { radius, space, useTheme } from '@/theme';

const GPS_TYPES: ActivityType[] = ['run', 'walk', 'ride', 'hike'];

const haptic = (s: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) => {
  if (Platform.OS !== 'web') Haptics.impactAsync(s).catch(() => {});
};

export default function Record() {
  const status = useRecorder((s) => s.status);
  const router = useRouter();
  useEffect(() => {
    if (status === 'finished') router.replace('/activity/finish');
  }, [status, router]);
  return status === 'idle' ? <PreStart /> : <Live />;
}

function GpsPill({ gps, accuracy }: { gps: GpsStatus; accuracy: number | null }) {
  const { c } = useTheme();
  const map = {
    off: { label: 'GPS off', color: c.danger, icon: 'location-outline' },
    searching: { label: 'Finding GPS…', color: c.warm, icon: 'locate-outline' },
    weak: { label: 'Weak GPS', color: c.warm, icon: 'locate' },
    good: { label: 'GPS ready', color: c.success, icon: 'locate' },
  } as const;
  const m = map[gps];
  return (
    <Row gap={2} style={{ backgroundColor: m.color + '22', paddingHorizontal: 12, height: 32, borderRadius: radius.pill }}>
      <Ionicons name={m.icon} size={14} color={m.color} />
      <T v="small" color={m.color} style={{ fontWeight: '800' }}>{m.label}{accuracy != null && gps !== 'off' ? ` · ±${Math.round(accuracy)} m` : ''}</T>
    </Row>
  );
}

function PreStart() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type, gps, accuracy, lastFix, setType, start } = useRecorder();
  const [battery, setBattery] = useState<{ level: number | null; perHour: number; hours: number | null } | null>(null);
  const [simulate, setSimulate] = useState(api.mode === 'demo' || Platform.OS === 'web');
  const [count, setCount] = useState<number | null>(null);
  const [scale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!simulate) startGpsPreview();
    else useRecorder.getState().setGps('good', 5);
  }, [simulate]);
  useEffect(() => {
    batteryEstimate(type).then(setBattery);
  }, [type]);
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.06, duration: 900, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [scale]);

  const begin = () => {
    if (gps === 'off' && !simulate) {
      Alert.alert('Location needed', 'Allow location access to record GPS activities, or log a workout manually.', [
        { text: 'Retry', onPress: () => startGpsPreview() },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    setCount(3);
    haptic();
    let n = 3;
    const t = setInterval(() => {
      n -= 1;
      if (n === 0) {
        clearInterval(t);
        setCount(null);
        haptic(Haptics.ImpactFeedbackStyle.Heavy);
        start(simulate);
        startTracking(type, { simulate });
      } else {
        setCount(n);
        haptic(Haptics.ImpactFeedbackStyle.Light);
      }
    }, 800);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <RouteMap points={lastFix ? [lastFix] : []} live height={820} style={{ position: "absolute", top: 0, left: 0, right: 0 }} />
      <LinearGradient colors={[c.bg + 'EE', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 180 }} />
      <View style={{ paddingTop: insets.top + space(2), paddingHorizontal: space(4) }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="close" label="Close" onPress={() => { stopTracking(); router.back(); }} />
          <GpsPill gps={gps} accuracy={accuracy} />
          <View style={{ width: 40 }} />
        </Row>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space(5), paddingBottom: insets.bottom + space(5), gap: space(5), borderTopWidth: 1, borderColor: c.border }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
          {GPS_TYPES.map((t) => {
            const on = t === type;
            return (
              <Pressable key={t} onPress={() => setType(t)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ alignItems: 'center', gap: 6, width: 76, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: on ? ACTIVITY_COLORS[t] + '22' : c.surface2, borderWidth: 1.5, borderColor: on ? ACTIVITY_COLORS[t] : 'transparent' }}>
                <MaterialCommunityIcons name={ACTIVITY_META[t].icon as MciName} size={26} color={on ? ACTIVITY_COLORS[t] : c.muted} />
                <T v="small" color={on ? c.text : c.muted} style={{ fontWeight: '700' }}>{ACTIVITY_META[t].label}</T>
              </Pressable>
            );
          })}
          <Pressable onPress={() => router.replace('/activity/log')} accessibilityRole="button"
            style={{ alignItems: 'center', gap: 6, width: 76, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: c.surface2 }}>
            <MaterialCommunityIcons name="dumbbell" size={26} color={c.muted} />
            <T v="small" color={c.muted} style={{ fontWeight: '700' }}>Gym / other</T>
          </Pressable>
        </ScrollView>

        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={2}>
            <Ionicons name="battery-half" size={18} color={c.muted} />
            <T v="small" color={c.muted}>
              {battery?.level != null ? `${battery.level}% · ~${battery.perHour}%/hr · ~${battery.hours}h of tracking` : `Est. ~${battery?.perHour ?? 9}% battery per hour`}
            </T>
          </Row>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T v="h3">Simulate GPS</T>
            <T v="small" color={c.muted}>Test recording without moving</T>
          </View>
          <Switch value={simulate} onValueChange={setSimulate} trackColor={{ true: c.primary, false: c.surface3 }} />
        </Row>

        <Animated.View style={{ alignSelf: 'center', transform: [{ scale }] }}>
          <Pressable onPress={begin} disabled={count != null} accessibilityRole="button" accessibilityLabel={`Start ${ACTIVITY_META[type].label}`}>
            <LinearGradient colors={['#2EE6C5', '#4DA3FF', '#7C6CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' }}>
              <T style={{ color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 1 }}>START</T>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>

      {count != null ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center' }]}>
          <T style={{ fontSize: 140, fontWeight: '900', color: '#fff' }}>{count}</T>
          <T v="h2" color="#ffffffcc">{ACTIVITY_META[type].verb}…</T>
        </View>
      ) : null}
    </View>
  );
}

function Live() {
  useSafeKeepAwake();
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe().data;
  const s = useRecorder();
  const [, tick] = useState(0);
  const [showMap, setShowMap] = useState(true);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  // After an app restart the recording is restored but no GPS source is attached yet.
  useEffect(() => {
    const st = useRecorder.getState();
    isTracking().then((on) => { if (!on) startTracking(st.type, { simulate: st.simulated }); });
  }, []);

  const moving = movingMsNow(s) / 1000;
  const speed = s.status === 'recording' ? currentSpeed(s.points) : 0;
  const isRide = s.type === 'ride';
  const kcal = estimateCalories(s.type, moving, s.distance, me?.private.weight_kg);
  const paused = s.status === 'paused';

  const finish = () => {
    const doFinish = async () => {
      haptic(Haptics.ImpactFeedbackStyle.Heavy);
      await stopTracking();
      s.finish({ weightKg: me?.private.weight_kg, heightCm: me?.private.height_cm });
      router.replace('/activity/finish');
    };
    if (moving < 10 && s.distance < 20) {
      Alert.alert('Too short to save', 'Discard this activity?', [
        { text: 'Keep going', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: async () => { await stopTracking(); s.discard(); router.back(); } },
      ]);
      return;
    }
    doFinish();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: space(4), paddingVertical: space(2) }}>
        <IconButton icon="chevron-down" label="Minimise" onPress={() => router.back()} />
        <Row gap={2}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: paused ? c.warm : c.danger }} />
          <T v="label" color={paused ? c.warm : c.danger}>{paused ? 'Paused' : `${ACTIVITY_META[s.type].verb}`}</T>
        </Row>
        <IconButton icon={showMap ? 'stats-chart' : 'map'} label={showMap ? 'Show stats' : 'Show map'} onPress={() => setShowMap(!showMap)} />
      </Row>

      {showMap ? (
        <RouteMap points={s.points} live height={300} style={{ marginHorizontal: space(4), borderRadius: radius.xl }} rounded={radius.xl} />
      ) : null}

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: space(6), paddingHorizontal: space(4) }}>
        <View style={{ alignItems: 'center' }}>
          <T v="label" color={c.muted}>Duration</T>
          <T style={{ fontSize: showMap ? 64 : 84, lineHeight: showMap ? 72 : 94, fontWeight: '900', letterSpacing: -2, fontVariant: ['tabular-nums'], color: paused ? c.warm : c.text }}>{duration(moving)}</T>
        </View>
        <Row gap={0} style={{ alignSelf: 'stretch' }}>
          <LiveStat label="Distance" value={km(s.distance)} unit="km" />
          <LiveStat label={isRide ? 'Speed' : 'Pace'} value={isRide ? speedKmh(speed) : pace(speed > 0.3 ? 1000 / speed : null)} unit={isRide ? 'km/h' : '/km'} />
        </Row>
        <Row gap={0} style={{ alignSelf: 'stretch' }}>
          <LiveStat label="Calories" value={int(kcal)} unit="kcal" small />
          <LiveStat label="Heart rate" value={s.hr ? String(s.hr) : '--'} unit="bpm" small />
          <LiveStat label={s.type === 'walk' ? 'Steps' : 'Elev. gain'} value={s.type === 'walk' ? int(s.steps ?? 0) : String(Math.round(s.elevation))} unit={s.type === 'walk' ? '' : 'm'} small />
        </Row>
        {s.gps !== 'good' && !paused ? <GpsPill gps={s.gps} accuracy={s.accuracy} /> : null}
      </View>

      <Row style={{ justifyContent: 'center', gap: space(6), paddingBottom: insets.bottom + space(6) }}>
        {paused ? (
          <>
            <RoundButton icon="play" label="Resume" color={c.primary} onPress={() => { haptic(); s.resume(); }} />
            <RoundButton icon="flag" label="Finish" color={c.danger} onPress={finish} />
          </>
        ) : (
          <RoundButton icon="pause" label="Pause" color={c.warm} big onPress={() => { haptic(); s.pause(); }} />
        )}
      </Row>
    </View>
  );
}

function LiveStat({ label, value, unit, small }: { label: string; value: string; unit: string; small?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Row gap={1} style={{ alignItems: 'baseline' }}>
        <T style={{ fontSize: small ? 26 : 40, lineHeight: small ? 32 : 46, fontWeight: '800', fontVariant: ['tabular-nums'], color: c.text, letterSpacing: -1 }}>{value}</T>
        {unit ? <T v="small" color={c.muted}>{unit}</T> : null}
      </Row>
      <T v="label" color={c.muted}>{label}</T>
    </View>
  );
}

function RoundButton({ icon, label, color, onPress, big }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string; onPress(): void; big?: boolean }) {
  const size = big ? 92 : 80;
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
        style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.93 : 1 }] })}>
        <Ionicons name={icon} size={big ? 38 : 32} color="#06080D" />
      </Pressable>
      <T v="label">{label}</T>
    </View>
  );
}
