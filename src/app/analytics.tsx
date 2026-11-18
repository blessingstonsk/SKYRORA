import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { BarChart, Heatmap, LineChart } from '@/components/charts';
import { Card, Chip, ErrorNote, Header, Loading, Row, Screen, Segmented, T } from '@/components/ui';
import { useMyActivities, useWeights } from '@/data/hooks';
import { dayKey, duration, int, km, pace, shortDate } from '@/lib/format';
import { between, bucketize, pctChange, RANGES, startOfWeek, totals, type RangeKey } from '@/lib/stats';
import { space, useTheme } from '@/theme';

type Metric = 'distance' | 'duration' | 'calories' | 'steps' | 'count';
const METRICS: { key: Metric; label: string }[] = [
  { key: 'distance', label: 'Distance' }, { key: 'duration', label: 'Time' }, { key: 'calories', label: 'Calories' },
  { key: 'steps', label: 'Steps' }, { key: 'count', label: 'Workouts' },
];

export default function Analytics() {
  const { c } = useTheme();
  const router = useRouter();
  const acts = useMyActivities();
  const weights = useWeights();
  const [range, setRange] = useState<RangeKey>('30d');
  const [metric, setMetric] = useState<Metric>('distance');
  const list = useMemo(() => acts.data ?? [], [acts.data]);
  const [now] = useState(() => Date.now());
  const r = RANGES.find((x) => x.key === range)!;

  const data = useMemo(() => {
    const from = new Date(now - (r.days - 1) * 86400000);
    from.setHours(0, 0, 0, 0);
    const prevFrom = new Date(from.getTime() - r.days * 86400000);
    const inRange = between(list, from);
    const cur = totals(inRange);
    const prev = totals(between(list, prevFrom, from));
    const runs = inRange.filter((a) => a.type === 'run' && a.distance_m > 0);
    const runT = totals(runs);
    const buckets = bucketize(list, r.days, r.bucket);
    const pick = (b: (typeof buckets)[number]) =>
      metric === 'distance' ? b.distance_m / 1000 : metric === 'duration' ? b.moving_time_s / 60 : metric === 'calories' ? b.calories : metric === 'steps' ? b.steps : b.count;
    const dayCounts = new Map<string, number>();
    list.forEach((a) => dayCounts.set(dayKey(a.started_at), (dayCounts.get(dayKey(a.started_at)) ?? 0) + 1));
    const activeDays = new Set(inRange.map((a) => dayKey(a.started_at))).size;
    const distTrend = bucketize(list, Math.max(r.days, 91), 'week').map((b) => ({ label: shortDate(b.start.toISOString()), value: b.distance_m / 1000 }));
    return { cur, prev, runPace: runT.distance_m ? runT.moving_time_s / (runT.distance_m / 1000) : null, bars: buckets.map((b) => ({ label: b.label, value: pick(b) })), dayCounts, activeDays, distTrend };
  }, [list, r, metric, now]);

  const weightSeries = useMemo(() => {
    const from = dayKey(now - Math.max(r.days, 30) * 86400000);
    return (weights.data ?? []).filter((w) => w.logged_on >= from).map((w) => ({ label: shortDate(w.logged_on), value: w.weight_kg }));
  }, [weights.data, r.days, now]);

  const fmt = (v: number) =>
    metric === 'distance' ? `${v.toFixed(1)} km` : metric === 'duration' ? `${Math.round(v)} min` : metric === 'count' ? `${v}` : int(v);

  // Weekly summary (deterministic, factual — no advice).
  const thisWeek = totals(between(list, startOfWeek()));
  const lastWeek = totals(between(list, new Date(startOfWeek().getTime() - 7 * 86400000), startOfWeek()));
  const wkPct = pctChange(thisWeek.moving_time_s, lastWeek.moving_time_s);

  if (acts.isLoading) return <Screen header={<Header title="Analytics" />}><Loading /></Screen>;
  if (acts.error) return <Screen header={<Header title="Analytics" />}><ErrorNote error={acts.error} onRetry={() => acts.refetch()} /></Screen>;

  const delta = (a: number, b: number) => {
    const p = pctChange(a, b);
    return p == null ? null : <T v="small" color={p >= 0 ? c.success : c.danger} style={{ fontWeight: '800' }}>{p >= 0 ? '▲' : '▼'} {Math.abs(p)}%</T>;
  };

  return (
    <Screen header={<Header title="Analytics" />} bottomInset={false}>
      <Card style={{ gap: space(2), borderColor: c.primary + '55' }}>
        <Row gap={2}><Ionicons name="sparkles" size={16} color={c.primary} /><T v="label" color={c.primary}>Weekly summary</T></Row>
        <T v="body">
          {thisWeek.count === 0
            ? 'No activities yet this week — a short walk is a great way to start.'
            : `You've completed ${thisWeek.count} workout${thisWeek.count === 1 ? '' : 's'} and ${km(thisWeek.distance_m, 1)} km this week${wkPct != null ? `. Active time is ${wkPct >= 0 ? 'up' : 'down'} ${Math.abs(wkPct)}% compared with last week` : ''}.`}
        </T>
      </Card>

      <Segmented options={RANGES.map((x) => ({ key: x.key, label: x.label }))} value={range} onChange={setRange} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
        <Total label="Distance" value={`${km(data.cur.distance_m, 1)} km`} delta={delta(data.cur.distance_m, data.prev.distance_m)} />
        <Total label="Active time" value={duration(data.cur.moving_time_s, true)} delta={delta(data.cur.moving_time_s, data.prev.moving_time_s)} />
        <Total label="Calories" value={int(data.cur.calories)} delta={delta(data.cur.calories, data.prev.calories)} />
        <Total label="Activities" value={String(data.cur.count)} delta={delta(data.cur.count, data.prev.count)} />
        <Total label="Avg run pace" value={`${pace(data.runPace)} /km`} />
        <Total label="Active days" value={`${data.activeDays}/${r.days}`} />
      </View>

      <Card style={{ gap: space(3) }}>
        <Row gap={2} wrap>
          {METRICS.map((m) => <Chip key={m.key} label={m.label} active={metric === m.key} onPress={() => setMetric(m.key)} />)}
        </Row>
        <BarChart data={data.bars} height={180} format={fmt} />
      </Card>

      <Card style={{ gap: space(3) }}>
        <T v="h3">Distance trend</T>
        <T v="small" color={c.muted}>Weekly kilometres</T>
        <LineChart data={data.distTrend} format={(v) => `${v.toFixed(1)} km`} color={c.info} showDots={false} height={160} />
      </Card>

      {weightSeries.length > 1 ? (
        <Card style={{ gap: space(3) }} onPress={() => router.push('/weight')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="h3">Weight trend</T>
            <T v="small" color={weightSeries[weightSeries.length - 1].value <= weightSeries[0].value ? c.success : c.warm} style={{ fontWeight: '800' }}>
              {(weightSeries[weightSeries.length - 1].value - weightSeries[0].value).toFixed(1)} kg
            </T>
          </Row>
          <LineChart data={weightSeries} format={(v) => `${v.toFixed(1)} kg`} color={c.secondary} height={160} />
        </Card>
      ) : null}

      <Card style={{ gap: space(3) }}>
        <T v="h3">Consistency</T>
        <T v="small" color={c.muted}>Each square is a day; brighter means more activities.</T>
        <Heatmap days={data.dayCounts} weeks={18} />
      </Card>

      <Card onPress={() => router.push('/records')}>
        <Row><Ionicons name="trophy" size={20} color={c.warm} /><T v="h3" style={{ flex: 1 }}>Personal records</T><Ionicons name="chevron-forward" size={18} color={c.faint} /></Row>
      </Card>
    </Screen>
  );
}

function Total({ label, value, delta }: { label: string; value: string; delta?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Card style={{ width: '47.5%', gap: 4 }}>
      <T v="label" color={c.muted}>{label}</T>
      <T v="h2">{value}</T>
      {delta ?? <T v="small" color={c.faint}> </T>}
    </Card>
  );
}
