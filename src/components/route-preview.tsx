// SVG route rendering: used in feed cards (cheap, no map tiles) and as the
// map fallback on web. Draws a stylised grid with the route on top.
import { useId, useMemo, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';

import { decodePolyline } from '@/lib/geo';
import { useTheme } from '@/theme';

export type LatLng = { lat: number; lng: number };

export function project(points: LatLng[], w: number, h: number, pad = 16) {
  if (!points.length) return [];
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p.lng * k);
  const ys = points.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-6, spanY = maxY - minY || 1e-6;
  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const offX = (w - spanX * scale) / 2, offY = (h - spanY * scale) / 2;
  return points.map((_, i) => ({ x: offX + (xs[i] - minX) * scale, y: h - (offY + (ys[i] - minY) * scale) }));
}

export function RoutePreview({
  polyline, points, height = 180, style, color, rounded = 0, live,
}: { polyline?: string | null; points?: LatLng[]; height?: number; style?: StyleProp<ViewStyle>; color?: string; rounded?: number; live?: boolean }) {
  const { c } = useTheme();
  const [w, setW] = useState(320);
  const pts = useMemo(() => points ?? decodePolyline(polyline), [points, polyline]);
  const xy = useMemo(() => project(pts, w, height, live ? 40 : 18), [pts, w, height, live]);
  const col = color ?? c.primary;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const d = xy.length ? `M ${xy.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}` : '';

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={[{ height, backgroundColor: c.map, borderRadius: rounded, overflow: 'hidden' }, style]}
      accessibilityRole="image"
      accessibilityLabel="Route map">
      <Svg width={w} height={height}>
        <Defs>
          <Pattern id={`grid${uid}`} width={28} height={28} patternUnits="userSpaceOnUse">
            <Path d="M 28 0 L 0 0 0 28" fill="none" stroke={c.mapGrid} strokeWidth={1} />
          </Pattern>
          <LinearGradient id={`route${uid}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={col} />
            <Stop offset="1" stopColor={c.secondary} />
          </LinearGradient>
        </Defs>
        <Rect width={w} height={height} fill={`url(#grid${uid})`} />
        {/* faux streets for texture */}
        <Path d={`M 0 ${height * 0.3} Q ${w * 0.4} ${height * 0.2} ${w} ${height * 0.42}`} stroke={c.mapGrid} strokeWidth={6} fill="none" />
        <Path d={`M ${w * 0.62} 0 Q ${w * 0.55} ${height * 0.5} ${w * 0.7} ${height}`} stroke={c.mapGrid} strokeWidth={5} fill="none" />
        {d ? (
          <>
            <Path d={d} stroke={col} strokeOpacity={0.25} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Path d={d} stroke={`url(#route${uid})`} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={xy[0].x} cy={xy[0].y} r={5} fill={c.success} stroke={c.map} strokeWidth={2} />
            <Circle cx={xy[xy.length - 1].x} cy={xy[xy.length - 1].y} r={live ? 8 : 5} fill={live ? col : c.danger} stroke={c.map} strokeWidth={2} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
