// Motion primitives: tweens, count-up numbers, staggered entrances, press
// feedback and skeleton placeholders. Built on React Native's Animated and
// requestAnimationFrame so they behave the same on iOS, Android and web.
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';

const NATIVE = Platform.OS !== 'web';
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Animate a number toward `target`. Returns the current value each frame. */
export function useTween(target: number, duration = 750, delay = 0): number {
  const [state, setState] = useState({ value: 0, target: 0 });
  useEffect(() => {
    const from = state.value;
    if (from === target) return;
    let raf = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start == null) start = now + delay;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      setState({ value: from + (target - from) * easeOut(t), target });
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // Only restart when the destination changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, delay]);
  return state.value;
}

/** 0 → 1 once on mount, for "grow in" chart animations. */
export function useMountProgress(duration = 800, delay = 0) {
  return useTween(1, duration, delay);
}

/**
 * Text whose first number counts up, keeping prefix/suffix and formatting:
 * "97.6 kg", "1,260", "12 days", "5/4", "4:30" (time-like values are left static).
 */
export function CountUp({ text, style, numberOfLines }: { text: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const m = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/.exec(text);
  // Clock and duration values ("4:30", "1h 7m", "45m") would look wrong mid-count; keep them static.
  const timeLike = /\d:\d|\d+h\b|\d+m\b/.test(text);
  const raw = m && !timeLike ? Number(m[2].replace(/,/g, '')) : NaN;
  const v = useTween(Number.isFinite(raw) ? raw : 0, 900);
  if (!m || timeLike || !Number.isFinite(raw)) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
  const decimals = m[2].includes('.') ? m[2].split('.')[1].length : 0;
  const commas = m[2].includes(',');
  const shown = commas
    ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : v.toFixed(decimals);
  return <Text style={style} numberOfLines={numberOfLines}>{m[1]}{shown}{m[3]}</Text>;
}

/** Fade + rise entrance, staggered by index. */
export function Appear({ children, index = 0, style, from = 14 }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle>; from?: number }) {
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1, duration: 420, delay: Math.min(index, 8) * 60,
      easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE,
    }).start();
  }, [anim, index]);
  return (
    <Animated.View style={[style, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Pressable with a springy scale-down on press. */
export function PressScale({ children, style, scaleTo = 0.97, ...props }: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const [scale] = useState(() => new Animated.Value(1));
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: NATIVE, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable {...props} onPressIn={(e) => { to(scaleTo); props.onPressIn?.(e); }} onPressOut={(e) => { to(1); props.onPressOut?.(e); }}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Looping 0→1→0 value for pulses and shimmers. */
export function usePulse(duration = 1400) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v, duration]);
  return v;
}

export function SkeletonBlock({ height, width = '100%', round = radius.lg, style }: { height: number; width?: number | `${number}%`; round?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const pulse = usePulse();
  return (
    <Animated.View style={[{ height, width, borderRadius: round, backgroundColor: c.surface2, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] }) }, style]} />
  );
}

/** Generic page skeleton: hero block, two tiles, a list card. */
export function PageSkeleton() {
  return (
    <View style={{ gap: 16, paddingVertical: 8 }} accessibilityLabel="Loading">
      <SkeletonBlock height={150} round={radius.xl} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <SkeletonBlock height={96} width="48.5%" />
        <SkeletonBlock height={96} width="48.5%" />
      </View>
      <SkeletonBlock height={64} />
      <SkeletonBlock height={64} />
    </View>
  );
}
