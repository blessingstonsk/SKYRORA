import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { GOAL_META, goalProgress } from '@/lib/stats';
import type { Activity, Goal } from '@/lib/types';
import { space, useTheme } from '@/theme';

import { ProgressBar, Row, T } from './ui';

const GOAL_COLORS: Record<Goal['type'], string> = {
  weight_loss: '#2EE6C5', weight_gain: '#2EE6C5', run_distance: '#4DA3FF', weekly_workouts: '#7C6CFF',
  daily_steps: '#3DDC84', calories: '#FF5C7A', strength: '#FFB547',
};

export function GoalRow({ goal, acts, weight, steps }: { goal: Goal; acts: Activity[]; weight: number | null; steps: number }) {
  const { c } = useTheme();
  const p = goalProgress(goal, acts, weight, steps);
  const color = GOAL_COLORS[goal.type];
  return (
    <View style={{ gap: space(2) }}>
      <Row>
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={GOAL_META[goal.type].icon as 'flame'} size={16} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="h3" numberOfLines={1}>{goal.title}</T>
          <T v="small" color={c.muted}>{p.label}</T>
        </View>
        <T v="h3" color={p.pct >= 100 ? c.success : c.text}>{p.pct >= 100 ? '✓' : `${p.pct}%`}</T>
      </Row>
      <ProgressBar pct={p.pct} color={color} height={6} />
    </View>
  );
}
