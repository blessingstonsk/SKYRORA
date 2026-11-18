// Lightweight SVG charts (no native deps beyond react-native-svg).
import { useState } from 'react';
import { Platform, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme';

import { T } from './ui';

const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : undefined;

function useWidth(initial = 320) {
  const [w, setW] = useState(initial);
  return { w, onLayout: (e: LayoutChangeEvent) => setW(Math.max(120, e.nativeEvent.layout.width)) };
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

export function BarChart({
  data, height = 160, color, format = (v) => String(Math.round(v)), highlightLast = true,
}: { data: { label: string; value: number }[]; height?: number; color?: string; format?: (v: number) => string; highlightLast?: boolean }) {
  const { c } = useTheme();
  const { w, onLayout } = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const col = color ?? c.primary;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const padB = 20, padT = 22;
  const chartH = height - padB - padT;
  const n = Math.max(1, data.length);
  const slot = w / n;
  const bw = Math.max(3, Math.min(28, slot * 0.6));
  const labelEvery = Math.ceil(n / 8);
  const active = sel ?? (highlightLast ? n - 1 : null);

  return (
    <View onLayout={onLayout} accessibilityRole="image" accessibilityLabel={`Bar chart, ${data.length} bars`}>
      <Svg width={w} height={height}>
        {[0.5, 1].map((f) => (
          <Line key={f} x1={0} x2={w} y1={padT + chartH * (1 - f)} y2={padT + chartH * (1 - f)} stroke={c.border} strokeDasharray="3 5" />
        ))}
        {data.map((d, i) => {
          const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * chartH);
          const x = i * slot + (slot - bw) / 2;
          const on = i === active;
          return (
            <G key={i}>
              <Rect x={x} y={padT + chartH - h} width={bw} height={h} rx={Math.min(6, bw / 2)} fill={col} opacity={on ? 1 : 0.38} />
              {i % labelEvery === 0 || on ? (
                <SvgText fontFamily={FONT} x={x + bw / 2} y={height - 4} fontSize={10} fill={on ? c.text : c.faint} textAnchor="middle" fontWeight={on ? '700' : '400'}>
                  {d.label}
                </SvgText>
              ) : null}
              {on && d.value > 0 ? (
                <SvgText fontFamily={FONT} x={Math.min(w - 20, Math.max(20, x + bw / 2))} y={padT + chartH - h - 6} fontSize={11} fill={c.text} textAnchor="middle" fontWeight="700">
                  {format(d.value)}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
      <View style={{ position: 'absolute', inset: 0, flexDirection: 'row' }}>
        {data.map((_, i) => (
          <Pressable key={i} style={{ flex: 1 }} onPress={() => setSel(i === sel ? null : i)} accessibilityLabel={`${data[i].label}: ${format(data[i].value)}`} />
        ))}
      </View>
    </View>
  );
}

export function LineChart({
  data, height = 180, color, format = (v) => v.toFixed(1), goal, showDots = true,
}: { data: { label: string; value: number }[]; height?: number; color?: string; format?: (v: number) => string; goal?: number | null; showDots?: boolean }) {
  const { c } = useTheme();
  const { w, onLayout } = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const col = color ?? c.primary;
  if (data.length === 0) return <View style={{ height }} />;
  const vals = data.map((d) => d.value).concat(goal != null ? [goal] : []);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max - min < 1) { max += 0.5; min -= 0.5; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;
  const padT = 24, padB = 20, padX = 6;
  const ch = height - padT - padB;
  const x = (i: number) => padX + (data.length === 1 ? (w - 2 * padX) / 2 : (i / (data.length - 1)) * (w - 2 * padX));
  const y = (v: number) => padT + ch * (1 - (v - min) / (max - min));
  // Smooth path (Catmull-Rom → Bézier)
  let d = `M ${x(0)} ${y(data[0].value)}`;
  for (let i = 0; i < data.length - 1; i++) {
    const p0 = data[Math.max(0, i - 1)], p1 = data[i], p2 = data[i + 1], p3 = data[Math.min(data.length - 1, i + 2)];
    const c1x = x(i) + (x(i + 1) - x(Math.max(0, i - 1))) / 6;
    const c1y = y(p1.value) + (y(p2.value) - y(p0.value)) / 6;
    const c2x = x(i + 1) - (x(Math.min(data.length - 1, i + 2)) - x(i)) / 6;
    const c2y = y(p2.value) - (y(p3.value) - y(p1.value)) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x(i + 1)} ${y(p2.value)}`;
  }
  const area = `${d} L ${x(data.length - 1)} ${padT + ch} L ${x(0)} ${padT + ch} Z`;
  const active = sel ?? data.length - 1;
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={col} stopOpacity={0.35} />
            <Stop offset="1" stopColor={col} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {goal != null ? (
          <G>
            <Line x1={0} x2={w} y1={y(goal)} y2={y(goal)} stroke={c.warm} strokeDasharray="4 5" strokeWidth={1.5} />
            <SvgText fontFamily={FONT} x={w - 4} y={y(goal) - 5} fontSize={10} fill={c.warm} textAnchor="end" fontWeight="700">Goal {format(goal)}</SvgText>
          </G>
        ) : null}
        <Path d={area} fill="url(#area)" />
        <Path d={d} stroke={col} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        {showDots && data.length <= 40
          ? data.map((p, i) => <Circle key={i} cx={x(i)} cy={y(p.value)} r={i === active ? 5 : 2.5} fill={i === active ? col : c.surface} stroke={col} strokeWidth={2} />)
          : <Circle cx={x(active)} cy={y(data[active].value)} r={5} fill={col} />}
        <Line x1={x(active)} x2={x(active)} y1={padT} y2={padT + ch} stroke={c.muted} strokeOpacity={0.3} />
        <SvgText fontFamily={FONT} x={Math.min(w - 24, Math.max(24, x(active)))} y={14} fontSize={12} fill={c.text} textAnchor="middle" fontWeight="800">
          {format(data[active].value)}
        </SvgText>
        {data.map((p, i) => (i % labelEvery === 0 ? (
          <SvgText fontFamily={FONT} key={`l${i}`} x={x(i)} y={height - 4} fontSize={10} fill={c.faint} textAnchor={i === 0 ? 'start' : 'middle'}>{p.label}</SvgText>
        ) : null))}
      </Svg>
      <View style={{ position: 'absolute', inset: 0, flexDirection: 'row' }}>
        {data.map((_, i) => <Pressable key={i} style={{ flex: 1 }} onPress={() => setSel(i)} />)}
      </View>
    </View>
  );
}

export function Ring({ pct, size = 120, stroke = 12, color, children, track }: { pct: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode; track?: string }) {
  const { c } = useTheme();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="progressbar" accessibilityValue={{ now: Math.round(p), min: 0, max: 100 }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? c.surface3} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? c.primary} strokeWidth={stroke} fill="none"
              strokeDasharray={`${(p / 100) * circ} ${circ}`} strokeLinecap="round" />
          </G>
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

/** GitHub-style consistency grid: one cell per day, weeks as columns. */
export function Heatmap({ days, weeks = 18 }: { days: Map<string, number>; weeks?: number }) {
  const { c } = useTheme();
  const { w, onLayout } = useWidth();
  const gap = 3;
  const cell = Math.floor((w - gap * (weeks - 1)) / weeks);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7;
  const start = new Date(today.getTime() - ((weeks - 1) * 7 + dow) * 86400000);
  const max = Math.max(1, ...days.values());
  const cells: { x: number; y: number; v: number; future: boolean }[] = [];
  for (let wk = 0; wk < weeks; wk++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getTime() + (wk * 7 + d) * 86400000);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      cells.push({ x: wk * (cell + gap), y: d * (cell + gap), v: days.get(key) ?? 0, future: date > today });
    }
  }
  return (
    <View onLayout={onLayout}>
      <Svg width={w} height={7 * (cell + gap)}>
        {cells.map((cl, i) => (
          <Rect key={i} x={cl.x} y={cl.y} width={cell} height={cell} rx={3}
            fill={cl.future ? 'transparent' : cl.v ? c.primary : c.surface3}
            opacity={cl.v ? 0.35 + 0.65 * (cl.v / max) : 1} />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, alignItems: 'center', marginTop: 8 }}>
        <T v="small" color={c.faint}>Less</T>
        {[0, 0.3, 0.6, 1].map((o) => <View key={o} style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: o ? c.primary : c.surface3, opacity: o ? 0.35 + 0.65 * o : 1 }} />)}
        <T v="small" color={c.faint}>More</T>
      </View>
    </View>
  );
}

export function Sparkline({ values, width = 80, height = 28, color }: { values: number[]; width?: number; height?: number; color?: string }) {
  const { c } = useTheme();
  if (values.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`);
  return (
    <Svg width={width} height={height}>
      <Path d={`M ${pts.join(' L ')}`} stroke={color ?? c.primary} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
