import { useEffect, useMemo, useState } from 'react';

import { useGoals, useMyActivities, useWeights } from '@/data/hooks';
import { stepsToday } from '@/lib/tracker';
import { between, bucketize, currentStreak, startOfDay, startOfWeek, totals, weightSummary } from '@/lib/stats';

/** Everything the Home dashboard needs, derived from cached queries. */
export function useDashboard() {
  const acts = useMyActivities();
  const weights = useWeights();
  const goals = useGoals();
  const [deviceSteps, setDeviceSteps] = useState<number | null>(null);

  useEffect(() => {
    stepsToday().then(setDeviceSteps);
  }, []);

  return useMemo(() => {
    const list = acts.data ?? [];
    const today = totals(between(list, startOfDay()));
    const week = totals(between(list, startOfWeek()));
    const lastWeekStart = new Date(startOfWeek().getTime() - 7 * 86400000);
    const lastWeek = totals(between(list, lastWeekStart, startOfWeek()));
    const steps = Math.max(deviceSteps ?? 0, today.steps);
    const weightGoal = goals.data?.find((g) => g.type === 'weight_loss' || g.type === 'weight_gain') ?? null;
    const w = weightSummary(weights.data ?? [], weightGoal);
    const stepGoal = goals.data?.find((g) => g.type === 'daily_steps')?.target_value ?? 10000;
    const workoutGoal = goals.data?.find((g) => g.type === 'weekly_workouts')?.target_value ?? 4;
    return {
      loading: acts.isLoading,
      error: acts.error,
      refetch: () => Promise.all([acts.refetch(), weights.refetch(), goals.refetch()]),
      activities: list,
      today: { ...today, steps },
      week,
      lastWeek,
      streak: currentStreak(list),
      weight: w,
      weightGoal,
      goals: goals.data ?? [],
      stepGoal,
      workoutGoal,
      weekBars: bucketize(list, 7, 'day'),
    };
  }, [deviceSteps, acts, weights, goals]);
}
