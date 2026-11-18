// Shared profile fields used by onboarding and Edit Profile.
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { ACTIVITY_META } from '@/lib/format';
import type { ActivityType, FitnessGoal, Gender } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

import { Avatar, Chip, Field, Row, T, type MciName } from './ui';

export const GENDERS: { key: Gender; label: string }[] = [
  { key: 'female', label: 'Female' }, { key: 'male', label: 'Male' },
  { key: 'non_binary', label: 'Non-binary' }, { key: 'prefer_not', label: 'Prefer not to say' },
];

export const GOALS: { key: FitnessGoal; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; body: string }[] = [
  { key: 'lose_weight', label: 'Lose weight', icon: 'trending-down', body: 'Burn more, track your trend' },
  { key: 'build_strength', label: 'Build strength', icon: 'barbell', body: 'Progressive overload in the gym' },
  { key: 'endurance', label: 'Endurance', icon: 'pulse', body: 'Go further and faster' },
  { key: 'stay_active', label: 'Stay active', icon: 'sunny', body: 'Move a little every day' },
  { key: 'gain_weight', label: 'Gain weight', icon: 'trending-up', body: 'Build mass steadily' },
];

export const PREF_TYPES: ActivityType[] = ['run', 'walk', 'ride', 'hike', 'strength', 'yoga', 'swim'];

export interface ProfileFormValue {
  full_name: string;
  username: string;
  bio: string;
  avatar: string | null;
  age: string;
  gender: Gender | null;
  height: string;
  weight: string;
  goal: FitnessGoal | null;
  prefs: ActivityType[];
}

export function AvatarPicker({ name, uri, onPick }: { name: string; uri: string | null; onPick(): void }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPick} style={{ alignSelf: 'center' }} accessibilityRole="button" accessibilityLabel="Choose profile photo">
      <Avatar name={name || '?'} uri={uri} size={104} ring />
      <View style={{ position: 'absolute', right: 2, bottom: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: c.bg }}>
        <Ionicons name="camera" size={16} color={c.primaryText} />
      </View>
    </Pressable>
  );
}

export function IdentityFields({ v, set, errors }: { v: ProfileFormValue; set(p: Partial<ProfileFormValue>): void; errors: Record<string, string | null> }) {
  return (
    <>
      <Field label="Name" value={v.full_name} onChangeText={(t) => set({ full_name: t })} maxLength={60} error={errors.full_name} />
      <Field label="Username" value={v.username} onChangeText={(t) => set({ username: t.toLowerCase() })} autoCapitalize="none" maxLength={24} error={errors.username} hint="Lowercase letters, numbers, _ and ." />
    </>
  );
}

export function BodyFields({ v, set, errors }: { v: ProfileFormValue; set(p: Partial<ProfileFormValue>): void; errors: Record<string, string | null> }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space(4) }}>
      <Row gap={3} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><Field label="Age" value={v.age} onChangeText={(t) => set({ age: t.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={3} error={errors.age} /></View>
        <View style={{ flex: 1 }}><Field label="Height (cm)" value={v.height} onChangeText={(t) => set({ height: t })} keyboardType="decimal-pad" maxLength={5} error={errors.height} /></View>
        <View style={{ flex: 1 }}><Field label="Weight (kg)" value={v.weight} onChangeText={(t) => set({ weight: t })} keyboardType="decimal-pad" maxLength={5} error={errors.weight} /></View>
      </Row>
      <View style={{ gap: 8 }}>
        <T v="label" color={c.muted}>Gender</T>
        <Row gap={2} wrap>
          {GENDERS.map((g) => <Chip key={g.key} label={g.label} active={v.gender === g.key} onPress={() => set({ gender: g.key })} />)}
        </Row>
      </View>
      <T v="small" color={c.faint}>Body metrics are private to you and only used to estimate calories and steps.</T>
    </View>
  );
}

export function GoalPicker({ value, onChange }: { value: FitnessGoal | null; onChange(g: FitnessGoal): void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space(2) }}>
      {GOALS.map((g) => {
        const on = value === g.key;
        return (
          <Pressable key={g.key} onPress={() => onChange(g.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(4), borderRadius: radius.lg, backgroundColor: on ? c.primary + '1A' : c.surface, borderWidth: 1.5, borderColor: on ? c.primary : c.border }}>
            <Ionicons name={g.icon} size={22} color={on ? c.primary : c.muted} />
            <View style={{ flex: 1 }}>
              <T v="h3">{g.label}</T>
              <T v="small" color={c.muted}>{g.body}</T>
            </View>
            {on ? <Ionicons name="checkmark-circle" size={22} color={c.primary} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrefsPicker({ value, onChange }: { value: ActivityType[]; onChange(v: ActivityType[]): void }) {
  return (
    <Row gap={2} wrap>
      {PREF_TYPES.map((t) => (
        <Chip key={t} label={ACTIVITY_META[t].label} icon={ACTIVITY_META[t].icon as MciName} active={value.includes(t)}
          onPress={() => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])} />
      ))}
    </Row>
  );
}
