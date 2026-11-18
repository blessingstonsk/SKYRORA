// Stats grid, splits, PR badges and comparison for summaries & detail views.
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { duration, int, km, pace, speedKmh } from '@/lib/format';
import { RECORD_META } from '@/lib/stats';
import type { Activity, RecordKey, Split, WorkoutSet } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

import { Card, Row, T } from './ui';

type Statable = Pick<Activity, 'type' | 'distance_m' | 'moving_time_s' | 'elapsed_time_s' | 'avg_pace_s_km' | 'avg_speed_mps' | 'max_speed_mps' | 'calories' | 'elevation_gain_m' | 'steps' | 'avg_hr' | 'max_hr'>;

export function StatsGrid({ a }: { a: Statable }) {
  const { c } = useTheme();
  const gps = a.distance_m > 0;
  const cells: [string, string, string?][] = gps
    ? [
        ['Distance', km(a.distance_m), 'km'],
        ['Moving time', duration(a.moving_time_s)],
        a.type === 'ride' ? ['Avg speed', speedKmh(a.avg_speed_mps), 'km/h'] : ['Avg pace', pace(a.avg_pace_s_km), '/km'],
        a.type === 'ride' ? ['Max speed', speedKmh(a.max_speed_mps), 'km/h'] : ['Speed', speedKmh(a.avg_speed_mps), 'km/h'],
        ['Calories', int(a.calories), 'kcal'],
        ['Elevation', String(Math.round(a.elevation_gain_m)), 'm'],
        ...(a.steps ? [['Steps', int(a.steps)] as [string, string]] : []),
        ...(a.avg_hr ? [['Avg HR', String(a.avg_hr), 'bpm'] as [string, string, string]] : []),
        ['Elapsed', duration(a.elapsed_time_s)],
      ]
    : [
        ['Duration', duration(a.moving_time_s)],
        ['Calories', int(a.calories), 'kcal'],
        ...(a.avg_hr ? [['Avg HR', String(a.avg_hr), 'bpm'] as [string, string, string]] : []),
      ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
      {cells.map(([label, value, unit], i) => (
        <View key={label} style={{ width: '33.33%', padding: space(4), borderColor: c.border, borderRightWidth: i % 3 === 2 ? 0 : 1, borderBottomWidth: i < cells.length - (cells.length % 3 || 3) ? 1 : 0 }}>
          <T v="label" color={c.muted}>{label}</T>
          <Row gap={1} style={{ alignItems: 'baseline', marginTop: 4 }}>
            <T v="h2" style={{ fontVariant: ['tabular-nums'] }}>{value}</T>
            {unit ? <T v="small" color={c.muted}>{unit}</T> : null}
          </Row>
        </View>
      ))}
    </View>
  );
}

export function Splits({ splits }: { splits: Split[] }) {
  const { c } = useTheme();
  if (!splits.length) return null;
  const best = Math.min(...splits.map((s) => s.seconds));
  const worst = Math.max(...splits.map((s) => s.seconds));
  return (
    <Card style={{ gap: space(2) }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="h3">Splits</T>
        <T v="small" color={c.muted}>per km</T>
      </Row>
      {splits.map((s) => {
        const pct = worst === best ? 100 : 40 + (60 * (worst - s.seconds)) / (worst - best);
        return (
          <Row key={s.km} gap={3}>
            <T v="small" color={c.muted} style={{ width: 24 }}>{s.km}</T>
            <T v="h3" style={{ width: 52, fontVariant: ['tabular-nums'] }}>{pace(s.seconds)}</T>
            <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: c.surface3 }}>
              <View style={{ width: `${pct}%`, height: 10, borderRadius: 5, backgroundColor: s.seconds === best ? c.primary : c.info + 'AA' }} />
            </View>
            <T v="small" color={c.muted} style={{ width: 44, textAlign: 'right' }}>{s.elevation > 0 ? '+' : ''}{s.elevation} m</T>
          </Row>
        );
      })}
    </Card>
  );
}

export function RecordBadges({ records }: { records: RecordKey[] }) {
  const { c } = useTheme();
  if (!records.length) return null;
  return (
    <Card style={{ gap: space(3), borderColor: c.warm + '66', backgroundColor: c.warm + '10' }}>
      <Row gap={2}><Ionicons name="trophy" size={18} color={c.warm} /><T v="h3">New personal record{records.length > 1 ? 's' : ''}!</T></Row>
      <Row gap={2} wrap>
        {records.map((r) => (
          <Row key={r} gap={1} style={{ backgroundColor: c.warm + '22', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill }}>
            <Ionicons name={RECORD_META[r].icon as 'flash'} size={14} color={c.warm} />
            <T v="small" color={c.warm} style={{ fontWeight: '800' }}>{RECORD_META[r].label}</T>
          </Row>
        ))}
      </Row>
    </Card>
  );
}

/** Compare with the average of the previous 5 activities of the same type. */
export function Comparison({ a, history }: { a: Statable & { started_at: string; id?: string }; history: Activity[] }) {
  const { c } = useTheme();
  const prev = history.filter((h) => h.type === a.type && h.id !== a.id && h.started_at < a.started_at).slice(0, 5);
  if (!prev.length || a.type === 'strength') return null;
  const avg = (f: (x: Activity) => number) => prev.reduce((s, x) => s + f(x), 0) / prev.length;
  const rows: { label: string; now: string; delta: number; better: boolean; fmt: string }[] = [];
  const dDist = a.distance_m - avg((x) => x.distance_m);
  rows.push({ label: 'Distance', now: `${km(a.distance_m)} km`, delta: dDist, better: dDist >= 0, fmt: `${dDist >= 0 ? '+' : '−'}${km(Math.abs(dDist))} km` });
  if (a.avg_pace_s_km) {
    const p = avg((x) => x.avg_pace_s_km ?? 0);
    const dp = a.avg_pace_s_km - p;
    rows.push({ label: 'Pace', now: `${pace(a.avg_pace_s_km)} /km`, delta: dp, better: dp <= 0, fmt: `${Math.abs(Math.round(dp))}s ${dp <= 0 ? 'faster' : 'slower'}` });
  }
  const dCal = a.calories - avg((x) => x.calories);
  rows.push({ label: 'Calories', now: `${int(a.calories)} kcal`, delta: dCal, better: dCal >= 0, fmt: `${dCal >= 0 ? '+' : '−'}${int(Math.abs(dCal))}` });
  return (
    <Card style={{ gap: space(3) }}>
      <T v="h3">vs your last {prev.length} {prev.length === 1 ? 'activity' : 'activities'}</T>
      {rows.map((r) => (
        <Row key={r.label} style={{ justifyContent: 'space-between' }}>
          <T v="body" color={c.muted}>{r.label}</T>
          <Row gap={2}>
            <T v="h3">{r.now}</T>
            <T v="small" color={r.better ? c.success : c.danger} style={{ fontWeight: '800', minWidth: 90, textAlign: 'right' }}>{r.better ? '▲' : '▼'} {r.fmt}</T>
          </Row>
        </Row>
      ))}
    </Card>
  );
}

export function SetsTable({ sets }: { sets: WorkoutSet[] }) {
  const { c } = useTheme();
  if (!sets.length) return null;
  const groups = new Map<string, WorkoutSet[]>();
  sets.forEach((s) => groups.set(s.exercise_name || s.exercise_id, [...(groups.get(s.exercise_name || s.exercise_id) ?? []), s]));
  const volume = sets.reduce((v, s) => v + (s.reps ?? 0) * (s.weight_kg ?? 0), 0);
  return (
    <Card style={{ gap: space(3) }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="h3">Exercises</T>
        <T v="small" color={c.muted}>{int(volume)} kg total volume</T>
      </Row>
      {[...groups].map(([name, list]) => (
        <View key={name} style={{ gap: 4 }}>
          <T v="h3" color={c.primary}>{name}</T>
          {list.map((s, i) => (
            <Row key={i} style={{ justifyContent: 'space-between' }}>
              <T v="small" color={c.muted}>Set {i + 1}</T>
              <T v="small" style={{ fontWeight: '700' }}>
                {s.reps != null ? `${s.reps} reps` : ''}{s.weight_kg ? ` × ${s.weight_kg} kg` : ''}{s.duration_s ? ` ${duration(s.duration_s)}` : ''}{s.rest_s ? `  · rest ${s.rest_s}s` : ''}
              </T>
            </Row>
          ))}
        </View>
      ))}
    </Card>
  );
}
