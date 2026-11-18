import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import type { Achievement } from '@/lib/types';
import { useTheme } from '@/theme';

import { T } from './ui';

const TIER: Record<Achievement['tier'], [string, string]> = {
  bronze: ['#E0A46E', '#9A5B2E'], silver: ['#E3E9F2', '#8D97A9'], gold: ['#FFD54A', '#E58E00'], platinum: ['#2EE6C5', '#7C6CFF'],
};

export function BadgeTile({ a, size = 64 }: { a: Achievement; size?: number }) {
  const { c } = useTheme();
  const earned = !!a.earned_at;
  return (
    <View style={{ width: size + 16, alignItems: 'center', gap: 6 }} accessibilityLabel={`${a.title}${earned ? ', earned' : ', locked'}`}>
      {earned ? (
        <LinearGradient colors={TIER[a.tier]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={a.icon as 'trophy'} size={size * 0.45} color="#fff" />
        </LinearGradient>
      ) : (
        <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.border }}>
          <Ionicons name="lock-closed" size={size * 0.32} color={c.faint} />
        </View>
      )}
      <T v="small" center numberOfLines={2} color={earned ? c.text : c.faint} style={{ fontSize: 11, fontWeight: '700' }}>{a.title}</T>
    </View>
  );
}
