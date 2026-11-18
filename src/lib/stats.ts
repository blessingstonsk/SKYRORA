// Client-side aggregation for dashboards, analytics, records, goals and weight.
import { dayKey } from './format';
import type { Activity, Goal, PersonalRecord, RecordKey, WeightLog } from './types';

const DAY = 86400000;

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday-based week start. */
export function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export interface Totals {
  count: number;
  distance_m: number;
  moving_time_s: number;
  calories: number;
  steps: number;
  elevation_m: number;
}

export function totals(acts: Activity[]): Totals {
  return acts.reduce<Totals>(
    (t, a) => ({
      count: t.count + 1,
      distance_m: t.distance_m + a.distance_m,
      moving_time_s: t.moving_time_s + a.moving_time_s,
      calories: t.calories + a.calories,
      steps: t.steps + (a.steps ?? 0),
      elevation_m: t.elevation_m + a.elevation_gain_m,
    }),
    { count: 0, distance_m: 0, moving_time_s: 0, calories: 0, steps: 0, elevation_m: 0 },
  );
}

export function between(acts: Activity[], from: Date, to = new Date(Date.now() + DAY)) {
  const f = from.getTime();
  const t = to.getTime();
  return acts.filter((a) => {
    const s = new Date(a.started_at).getTime();
    return s >= f && s < t;
  });
}

/** Consecutive active days ending today (or yesterday, so the streak survives until midnight). */
export function currentStreak(acts: Activity[]): number {
  const days = new Set(acts.map((a) => dayKey(a.started_at)));
  let cursor = startOfDay();
  if (!days.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY);
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n++;
    cursor = new Date(cursor.getTime() - DAY);
  }
  return n;
}

export function longestStreak(acts: Activity[]): number {
  const days = [...new Set(acts.map((a) => dayKey(a.started_at)))].sort();
  let best = 0, run = 0, prev: number | null = null;
  for (const d of days) {
    const t = new Date(d + 'T00:00:00').getTime();
    run = prev != null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

export type RangeKey = '7d' | '30d' | '3m' | '6m' | '1y';
export const RANGES: { key: RangeKey; label: string; days: number; bucket: 'day' | 'week' | 'month' }[] = [
  { key: '7d', label: '7D', days: 7, bucket: 'day' },
  { key: '30d', label: '30D', days: 30, bucket: 'day' },
  { key: '3m', label: '3M', days: 91, bucket: 'week' },
  { key: '6m', label: '6M', days: 182, bucket: 'week' },
  { key: '1y', label: '1Y', days: 365, bucket: 'month' },
];

export interface Bucket extends Totals {
  start: Date;
  label: string;
}

/** Group activities into day/week/month buckets covering the last `days`. */
export function bucketize(acts: Activity[], days: number, bucket: 'day' | 'week' | 'month'): Bucket[] {
  const end = startOfDay();
  const from = new Date(end.getTime() - (days - 1) * DAY);
  const starts: Date[] = [];
  if (bucket === 'day') {
    for (let t = from.getTime(); t <= end.getTime(); t += DAY) starts.push(new Date(t));
  } else if (bucket === 'week') {
    for (let d = startOfWeek(from); d <= end; d = new Date(d.getTime() + 7 * DAY)) starts.push(d);
  } else {
    for (let d = startOfMonth(from); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) starts.push(d);
  }
  return starts.map((s, i) => {
    const next = starts[i + 1] ?? new Date(end.getTime() + DAY);
    const label =
      bucket === 'day'
        ? days <= 7
          ? s.toLocaleDateString('en-US', { weekday: 'narrow' })
          : String(s.getDate())
        : bucket === 'week'
          ? s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : s.toLocaleDateString('en-US', { month: 'short' });
    return { start: s, label, ...totals(between(acts, s, next)) };
  });
}

/** Percent change helper; null when the baseline is zero. */
export function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

// --- Personal records ---------------------------------------------------------

export const RECORD_META: Record<RecordKey, { label: string; icon: string; kind: 'time' | 'distance' | 'kcal' | 'days' | 'duration' }> = {
  fastest_1k: { label: 'Fastest 1 km', icon: 'flash', kind: 'time' },
  fastest_5k: { label: 'Fastest 5 km', icon: 'speedometer', kind: 'time' },
  fastest_10k: { label: 'Fastest 10 km', icon: 'rocket', kind: 'time' },
  longest_run: { label: 'Longest run', icon: 'trending-up', kind: 'distance' },
  longest_ride: { label: 'Longest ride', icon: 'bicycle', kind: 'distance' },
  longest_walk: { label: 'Longest walk', icon: 'footsteps', kind: 'distance' },
  most_calories: { label: 'Most calories', icon: 'flame', kind: 'kcal' },
  most_active_week: { label: 'Most active week', icon: 'calendar', kind: 'duration' },
  longest_streak: { label: 'Longest streak', icon: 'infinite', kind: 'days' },
};

export function computeRecords(acts: Activity[]): PersonalRecord[] {
  const out: PersonalRecord[] = [];
  const best = (key: RecordKey, pick: (a: Activity) => number | undefined | null, lower = false, filter?: (a: Activity) => boolean) => {
    let top: Activity | null = null;
    let val = lower ? Infinity : 0;
    for (const a of acts) {
      if (filter && !filter(a)) continue;
      const v = pick(a);
      if (v == null || v <= 0) continue;
      if (lower ? v < val : v > val) { val = v; top = a; }
    }
    if (top) out.push({ record: key, value: val, activity_id: top.id, achieved_at: top.started_at });
  };
  const isRun = (a: Activity) => a.type === 'run';
  best('fastest_1k', (a) => a.best_efforts?.['1k'], true, isRun);
  best('fastest_5k', (a) => a.best_efforts?.['5k'], true, isRun);
  best('fastest_10k', (a) => a.best_efforts?.['10k'], true, isRun);
  best('longest_run', (a) => a.distance_m, false, isRun);
  best('longest_ride', (a) => a.distance_m, false, (a) => a.type === 'ride');
  best('longest_walk', (a) => a.distance_m, false, (a) => a.type === 'walk');
  best('most_calories', (a) => a.calories);

  const weeks = new Map<string, number>();
  for (const a of acts) {
    const k = dayKey(startOfWeek(new Date(a.started_at)));
    weeks.set(k, (weeks.get(k) ?? 0) + a.moving_time_s);
  }
  let bw: [string, number] | null = null;
  for (const e of weeks) if (!bw || e[1] > bw[1]) bw = e;
  if (bw) out.push({ record: 'most_active_week', value: bw[1], activity_id: null, achieved_at: bw[0] });
  const ls = longestStreak(acts);
  if (ls) out.push({ record: 'longest_streak', value: ls, activity_id: null, achieved_at: new Date().toISOString() });
  return out;
}

/** Records that `a` set or tied, compared with all earlier activities. */
export function recordsSetBy(a: Activity, previous: Activity[]): RecordKey[] {
  const before = computeRecords(previous.filter((p) => p.id !== a.id));
  const after = computeRecords([...previous.filter((p) => p.id !== a.id), a]);
  const map = new Map(before.map((r) => [r.record, r.value]));
  return after
    .filter((r) => r.activity_id === a.id && r.record !== 'most_active_week' && map.get(r.record) !== r.value)
    .map((r) => r.record);
}

// --- Weight -------------------------------------------------------------------

export interface WeightSummary {
  latest: number | null;
  start: number | null;
  totalChange: number;
  weeklyAvgChange: number | null;
  monthChange: number | null;
  pctToGoal: number | null;
  etaDate: Date | null;
  series: { date: string; weight: number; change: number }[];
}

export function weightSummary(logs: WeightLog[], goal?: Goal | null): WeightSummary {
  const sorted = [...logs].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
  const series = sorted.map((l, i) => ({
    date: l.logged_on,
    weight: l.weight_kg,
    change: i === 0 ? 0 : Math.round((l.weight_kg - sorted[i - 1].weight_kg) * 10) / 10,
  }));
  if (!sorted.length) {
    return { latest: null, start: null, totalChange: 0, weeklyAvgChange: null, monthChange: null, pctToGoal: null, etaDate: null, series };
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const spanDays = Math.max(1, (new Date(last.logged_on).getTime() - new Date(first.logged_on).getTime()) / DAY);

  // Least-squares slope (kg/day) is more robust to day-to-day fluctuation than first/last.
  const xs = sorted.map((l) => new Date(l.logged_on).getTime() / DAY);
  const ys = sorted.map((l) => l.weight_kg);
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = den ? num / den : 0;

  const monthAgo = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
  const monthBase = [...sorted].reverse().find((l) => l.logged_on <= monthAgo) ?? first;

  let pctToGoal: number | null = null;
  let etaDate: Date | null = null;
  if (goal && (goal.type === 'weight_loss' || goal.type === 'weight_gain')) {
    const start = goal.start_value ?? first.weight_kg;
    const span = goal.target_value - start;
    if (span !== 0) pctToGoal = Math.max(0, Math.min(100, Math.round(((last.weight_kg - start) / span) * 100)));
    const remaining = goal.target_value - last.weight_kg;
    if (slope !== 0 && Math.sign(remaining) === Math.sign(slope) && Math.abs(remaining) > 0.05) {
      etaDate = new Date(Date.now() + (remaining / slope) * DAY);
    }
  }

  return {
    latest: last.weight_kg,
    start: first.weight_kg,
    totalChange: Math.round((last.weight_kg - first.weight_kg) * 10) / 10,
    weeklyAvgChange: spanDays >= 7 ? Math.round(slope * 7 * 100) / 100 : null,
    monthChange: Math.round((last.weight_kg - monthBase.weight_kg) * 10) / 10,
    pctToGoal,
    etaDate,
    series,
  };
}

// --- Goals --------------------------------------------------------------------

export function goalProgress(goal: Goal, acts: Activity[], latestWeight: number | null, todaySteps: number) {
  const now = new Date();
  let current = 0;
  switch (goal.type) {
    case 'weight_loss':
    case 'weight_gain': {
      const start = goal.start_value ?? latestWeight ?? 0;
      const span = goal.target_value - start;
      current = latestWeight ?? start;
      const pct = span === 0 ? 100 : ((current - start) / span) * 100;
      return { current, pct: clamp(pct), label: `${current.toFixed(1)} / ${goal.target_value} ${goal.unit}` };
    }
    case 'run_distance': {
      const from = goal.deadline ? new Date(goal.created_at) : startOfMonth(now);
      current = between(acts.filter((a) => a.type === 'run'), from).reduce((s, a) => s + a.distance_m, 0) / 1000;
      break;
    }
    case 'weekly_workouts':
      current = between(acts, startOfWeek(now)).length;
      break;
    case 'daily_steps':
      current = todaySteps;
      break;
    case 'calories':
      current = between(acts, startOfWeek(now)).reduce((s, a) => s + a.calories, 0);
      break;
    case 'strength': {
      const sets = acts.flatMap((a) => a.sets ?? []).filter((s) => s.exercise_id === goal.exercise_id);
      current = sets.reduce((m, s) => Math.max(m, s.weight_kg ?? 0), goal.start_value ?? 0);
      const span = goal.target_value - (goal.start_value ?? 0);
      return { current, pct: clamp(span ? ((current - (goal.start_value ?? 0)) / span) * 100 : 0), label: `${current} / ${goal.target_value} ${goal.unit}` };
    }
  }
  const rounded = Math.round(current * 10) / 10;
  return { current: rounded, pct: clamp((current / goal.target_value) * 100), label: `${rounded.toLocaleString()} / ${goal.target_value.toLocaleString()} ${goal.unit}` };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export const GOAL_META: Record<Goal['type'], { label: string; unit: string; icon: string; hint: string }> = {
  weight_loss: { label: 'Lose weight', unit: 'kg', icon: 'trending-down', hint: 'Target weight' },
  weight_gain: { label: 'Gain weight', unit: 'kg', icon: 'trending-up', hint: 'Target weight' },
  run_distance: { label: 'Running distance', unit: 'km', icon: 'walk', hint: 'Distance this month' },
  weekly_workouts: { label: 'Weekly workouts', unit: 'workouts', icon: 'calendar', hint: 'Workouts per week' },
  daily_steps: { label: 'Daily steps', unit: 'steps', icon: 'footsteps', hint: 'Steps per day' },
  calories: { label: 'Calorie burn', unit: 'kcal', icon: 'flame', hint: 'Active kcal per week' },
  strength: { label: 'Strength', unit: 'kg', icon: 'barbell', hint: 'Target lift weight' },
};
