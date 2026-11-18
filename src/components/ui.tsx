// Core UI primitives for SKYRO.
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACTIVITY_META, initials } from '@/lib/format';
import type { ActivityType } from '@/lib/types';
import { gradients, radius, space, type as typo, useTheme } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// --- Text ---------------------------------------------------------------------
type Variant = keyof typeof typo;
export function T({
  v = 'body', color, style, children, numberOfLines, center,
}: { v?: Variant; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; center?: boolean }) {
  const { c } = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[typo[v], { color: color ?? c.text }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

// --- Layout -------------------------------------------------------------------
export function Screen({
  children, scroll = true, padded = true, style, refresh, header, bottomInset = true,
}: {
  children: ReactNode; scroll?: boolean; padded?: boolean; style?: StyleProp<ViewStyle>;
  refresh?: ReactNode; header?: ReactNode; bottomInset?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = padded ? { paddingHorizontal: space(4) } : null;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: (bottomInset ? 110 : 24) + insets.bottom, gap: space(4) }, style]}
          showsVerticalScrollIndicator={false}
          refreshControl={refresh as never}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad, style]}>{children}</View>
      )}
    </View>
  );
}

export function Header({ title, back = true, right, subtitle }: { title?: string; back?: boolean; right?: ReactNode; subtitle?: string }) {
  const router = useRouter();
  const { c } = useTheme();
  return (
    <View style={styles.header}>
      {back ? (
        <IconButton icon="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} label="Back" />
      ) : <View style={{ width: 40 }} />}
      <View style={{ flex: 1, alignItems: 'center' }}>
        {title ? <T v="h3" numberOfLines={1}>{title}</T> : null}
        {subtitle ? <T v="small" color={c.muted}>{subtitle}</T> : null}
      </View>
      <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function Row({ children, gap = 3, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space(gap) }, wrap && { flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Card({ children, style, onPress, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean }) {
  const { c } = useTheme();
  const base = [{ backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }, padded && { padding: space(4) }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>
      {children}
    </Pressable>
  );
}

export function GradientCard({ children, style, colors }: { children: ReactNode; style?: StyleProp<ViewStyle>; colors?: readonly [string, string, ...string[]] }) {
  return (
    <LinearGradient colors={colors ?? gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: radius.xl, padding: space(5), overflow: 'hidden' }, style]}>
      {children}
    </LinearGradient>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { c } = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space(2) }}>
      <T v="h2">{title}</T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <T v="small" color={c.primary}>{action}</T>
        </Pressable>
      ) : null}
    </Row>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

// --- Buttons ------------------------------------------------------------------
export function Button({
  title, onPress, variant = 'primary', icon, loading, disabled, style, size = 'lg',
}: {
  title: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  icon?: IconName; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; size?: 'md' | 'lg';
}) {
  const { c } = useTheme();
  const h = size === 'lg' ? 54 : 42;
  const fg = variant === 'primary' ? '#03120F' : variant === 'danger' ? '#fff' : variant === 'outline' || variant === 'ghost' ? c.text : c.text;
  const content = (
    <Row gap={2} style={{ justifyContent: 'center', height: h, paddingHorizontal: space(5) }}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <T v="h3" color={fg} style={{ fontSize: size === 'lg' ? 16 : 14 }}>{title}</T>
    </Row>
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        { borderRadius: radius.pill, overflow: 'hidden', opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        variant === 'secondary' && { backgroundColor: c.surface2 },
        variant === 'danger' && { backgroundColor: c.danger },
        variant === 'outline' && { borderWidth: 1, borderColor: c.border },
        style,
      ]}>
      {variant === 'primary' ? (
        <LinearGradient colors={['#2EE6C5', '#36D3E6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>{content}</LinearGradient>
      ) : content}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, size = 22, color, bg, badge }: { icon: IconName; onPress?: () => void; label: string; size?: number; color?: string; bg?: string; badge?: number }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: bg ?? c.surface2 }, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={size} color={color ?? c.text} />
      {badge ? (
        <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: MciName }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: radius.pill,
        backgroundColor: active ? c.text : c.surface2, opacity: pressed ? 0.8 : 1,
      }]}>
      {icon ? <MaterialCommunityIcons name={icon} size={16} color={active ? c.bg : c.muted} /> : null}
      <T v="small" color={active ? c.bg : c.text} style={{ fontWeight: '700' }}>{label}</T>
    </Pressable>
  );
}

export function Segmented<K extends string>({ options, value, onChange }: { options: { key: NoInfer<K>; label: string }[]; value: K; onChange(k: NoInfer<K>): void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surface2, borderRadius: radius.pill, padding: 4 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.surface : 'transparent' }}>
            <T v="small" color={on ? c.text : c.muted} style={{ fontWeight: '700' }}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

// --- Data display -------------------------------------------------------------
export function Stat({ value, unit, label, big, color, align = 'left' }: { value: string; unit?: string; label: string; big?: boolean; color?: string; align?: 'left' | 'center' }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      <Row gap={1} style={{ alignItems: 'baseline' }}>
        <T v={big ? 'hero' : 'stat'} color={color}>{value}</T>
        {unit ? <T v="small" color={c.muted} style={{ fontWeight: '700' }}>{unit}</T> : null}
      </Row>
      <T v="label" color={c.muted} style={{ marginTop: 2 }}>{label}</T>
    </View>
  );
}

export function MiniStat({ icon, value, label, color }: { icon: IconName; value: string; label: string; color: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 140, backgroundColor: c.surface, borderRadius: radius.lg, padding: space(4), borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: space(2) }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <T v="stat" style={{ fontSize: 24 }}>{value}</T>
      <T v="small" color={c.muted}>{label}</T>
    </View>
  );
}

export function ProgressBar({ pct, color, height = 8, track }: { pct: number; color?: string; height?: number; track?: string }) {
  const { c } = useTheme();
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.max(0, Math.min(100, pct)), duration: 700, useNativeDriver: false }).start();
  }, [pct, anim]);
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track ?? c.surface3, overflow: 'hidden' }}
      accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <Animated.View style={{ height, borderRadius: height, backgroundColor: color ?? c.primary, width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

export function Avatar({ name, uri, size = 40, ring }: { name?: string | null; uri?: string | null; size?: number; ring?: boolean }) {
  const { c } = useTheme();
  const inner = uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" transition={150} />
  ) : (
    <LinearGradient colors={pickGradient(name ?? '')} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials(name)}</Text>
    </LinearGradient>
  );
  if (!ring) return inner;
  return <View style={{ padding: 3, borderRadius: size, borderWidth: 2, borderColor: c.primary }}>{inner}</View>;
}

const AVATAR_GRADIENTS: [string, string][] = [
  ['#2EE6C5', '#4DA3FF'], ['#7C6CFF', '#C86CFF'], ['#FFB547', '#FF5C7A'], ['#4DA3FF', '#7C6CFF'], ['#3DDC84', '#2EE6C5'], ['#FF5C7A', '#7C6CFF'],
];
function pickGradient(seed: string): [string, string] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export const ACTIVITY_COLORS: Record<ActivityType, string> = {
  run: '#2EE6C5', walk: '#4DA3FF', ride: '#7C6CFF', hike: '#3DDC84', strength: '#FFB547', yoga: '#FF8FD1', swim: '#36C8FF', other: '#8D97A9',
};

export function ActivityIcon({ type, size = 40 }: { type: ActivityType; size?: number }) {
  const color = ACTIVITY_COLORS[type];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name={ACTIVITY_META[type].icon as MciName} size={size * 0.55} color={color} />
    </View>
  );
}

export function Badge({ label, color }: { label: string; color?: string }) {
  const { c } = useTheme();
  const col = color ?? c.primary;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: col + '22', alignSelf: 'flex-start' }}>
      <T v="label" color={col} style={{ fontSize: 10 }}>{label}</T>
    </View>
  );
}

export function Empty({ icon, title, body, action, onAction }: { icon: IconName; title: string; body?: string; action?: string; onAction?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space(10), gap: space(3) }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={28} color={c.muted} />
      </View>
      <T v="h3" center>{title}</T>
      {body ? <T v="body" color={c.muted} center style={{ maxWidth: 280 }}>{body}</T> : null}
      {action ? <Button title={action} onPress={onAction} size="md" style={{ marginTop: space(2) }} /> : null}
    </View>
  );
}

export function Loading() {
  const { c } = useTheme();
  return (
    <View style={{ paddingVertical: space(12), alignItems: 'center' }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { c } = useTheme();
  return (
    <Card style={{ borderColor: c.danger + '55' }}>
      <T v="h3" color={c.danger}>Something went wrong</T>
      <T v="small" color={c.muted} style={{ marginTop: 4 }}>{error instanceof Error ? error.message : String(error)}</T>
      {onRetry ? <Button title="Try again" variant="secondary" size="md" onPress={onRetry} style={{ marginTop: 12, alignSelf: 'flex-start' }} /> : null}
    </Card>
  );
}

// --- Forms --------------------------------------------------------------------
export function Field({ label, error, hint, style, ...props }: TextInputProps & { label?: string; error?: string | null; hint?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <T v="label" color={c.muted}>{label}</T> : null}
      <TextInput
        placeholderTextColor={c.faint}
        {...props}
        style={[{
          minHeight: 52, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: props.multiline ? 14 : 0,
          backgroundColor: c.surface2, color: c.text, fontSize: 16, borderWidth: 1, borderColor: error ? c.danger : 'transparent',
          textAlignVertical: props.multiline ? 'top' : 'center',
        }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object), style]}
      />
      {error ? <T v="small" color={c.danger}>{error}</T> : hint ? <T v="small" color={c.faint}>{hint}</T> : null}
    </View>
  );
}

export function ListItem({ icon, title, subtitle, right, onPress, danger, iconColor }: { icon?: IconName; title: string; subtitle?: string; right?: ReactNode; onPress?: PressableProps['onPress']; danger?: boolean; iconColor?: string }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3) }, pressed && { opacity: 0.7 }]}>
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: (iconColor ?? (danger ? c.danger : c.text)) + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={iconColor ?? (danger ? c.danger : c.text)} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T v="h3" color={danger ? c.danger : c.text} style={{ fontWeight: '600' }}>{title}</T>
        {subtitle ? <T v="small" color={c.muted}>{subtitle}</T> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={c.faint} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), paddingVertical: space(2), gap: space(2) },
});
