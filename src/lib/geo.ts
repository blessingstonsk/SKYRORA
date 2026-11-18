// GPS math: distance, pace, elevation, splits, best efforts, smoothing,
// privacy trimming and Google polyline encoding. Pure functions, unit-testable.
import type { GeoPoint, Split } from './types';

const R = 6371008.8; // mean Earth radius, metres
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Decide whether a new GPS fix should be accepted. Rejects poor-accuracy fixes
 * and physically implausible jumps (GPS spikes) for the given activity type.
 */
export function acceptFix(prev: GeoPoint | undefined, next: GeoPoint, maxSpeedMps: number): boolean {
  if (next.accuracy != null && next.accuracy > 35) return false;
  if (!prev) return true;
  const dt = (next.t - prev.t) / 1000;
  if (dt <= 0) return false;
  const d = haversine(prev, next);
  if (d / dt > maxSpeedMps) return false;
  return true;
}

export const MAX_SPEED: Record<string, number> = {
  run: 12, walk: 4, hike: 4, ride: 30, other: 30, strength: 30, yoga: 30, swim: 5,
};

export function totalDistance(points: GeoPoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
  return d;
}

/** Elevation gain with a hysteresis threshold to ignore barometric/GPS noise. */
export function elevationGain(points: GeoPoint[], threshold = 3): number {
  let gain = 0;
  let ref: number | null = null;
  for (const p of points) {
    if (p.alt == null) continue;
    if (ref == null) { ref = p.alt; continue; }
    const diff = p.alt - ref;
    if (diff >= threshold) { gain += diff; ref = p.alt; }
    else if (diff <= -threshold) { ref = p.alt; }
  }
  return Math.round(gain * 10) / 10;
}

/** Pace in seconds per km, or null if not moving. */
export function paceSecPerKm(distanceM: number, seconds: number): number | null {
  if (distanceM < 10 || seconds <= 0) return null;
  return seconds / (distanceM / 1000);
}

/** Rolling current pace/speed over the last `windowS` seconds. */
export function currentSpeed(points: GeoPoint[], windowS = 15): number {
  if (points.length < 2) return 0;
  const end = points[points.length - 1];
  let i = points.length - 2;
  let d = 0;
  while (i >= 0 && (end.t - points[i].t) / 1000 <= windowS) {
    d += haversine(points[i], points[i + 1]);
    i--;
  }
  const start = points[i + 1];
  const dt = (end.t - start.t) / 1000;
  return dt > 0 ? d / dt : 0;
}

/**
 * Splits per full kilometre. Pause gaps are excluded because points are only
 * appended while recording; time deltas larger than `gapS` are treated as pauses.
 */
export function computeSplits(points: GeoPoint[], gapS = 30): Split[] {
  const splits: Split[] = [];
  let distAcc = 0;
  let timeAcc = 0;
  let elevStart = points[0]?.alt ?? null;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1], points[i]);
    const dt = (points[i].t - points[i - 1].t) / 1000;
    distAcc += d;
    if (dt < gapS) timeAcc += dt;
    if (distAcc >= 1000) {
      // Interpolate overshoot back to exactly 1 km.
      const over = distAcc - 1000;
      const frac = d > 0 ? over / d : 0;
      const t = timeAcc - (dt < gapS ? dt * frac : 0);
      const alt = points[i].alt ?? null;
      splits.push({
        km: splits.length + 1,
        seconds: Math.round(t),
        elevation: alt != null && elevStart != null ? Math.round(alt - elevStart) : 0,
      });
      distAcc = over;
      timeAcc = timeAcc - t;
      elevStart = alt;
    }
  }
  return splits;
}

/** Fastest time (s) to cover each target distance anywhere within the activity. Two-pointer O(n). */
export function bestEfforts(points: GeoPoint[], targets: Record<string, number> = { '1k': 1000, '5k': 5000, '10k': 10000 }) {
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + haversine(points[i - 1], points[i]));
  const out: Record<string, number> = {};
  for (const [key, target] of Object.entries(targets)) {
    if (cum[cum.length - 1] < target) continue;
    let best = Infinity;
    let j = 0;
    for (let i = 0; i < points.length; i++) {
      while (j < points.length && cum[j] - cum[i] < target) j++;
      if (j >= points.length) break;
      // Linear interpolation inside the segment that crosses the target.
      const segD = cum[j] - cum[j - 1];
      const need = target - (cum[j - 1] - cum[i]);
      const frac = segD > 0 ? need / segD : 1;
      const t = (points[j - 1].t + (points[j].t - points[j - 1].t) * frac - points[i].t) / 1000;
      if (t > 0 && t < best) best = t;
    }
    if (Number.isFinite(best)) out[key] = Math.round(best);
  }
  return out;
}

/** Drop points within `meters` of the start and end, plus any inside privacy zones. */
export function trimForPrivacy(
  points: GeoPoint[],
  meters: number,
  zones: { lat: number; lng: number; radius_m: number }[] = [],
): GeoPoint[] {
  if (points.length < 2) return points;
  const start = points[0];
  const end = points[points.length - 1];
  return points.filter(
    (p) =>
      (meters <= 0 || (haversine(p, start) > meters && haversine(p, end) > meters)) &&
      !zones.some((z) => haversine(p, z) <= z.radius_m),
  );
}

/** Douglas–Peucker simplification (tolerance in metres) to keep stored polylines small. */
export function simplify(points: GeoPoint[], tolerance = 4): GeoPoint[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  const lat0 = toRad(points[0].lat);
  const xy = points.map((p) => [toRad(p.lng) * Math.cos(lat0) * R, toRad(p.lat) * R]);
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    const [x1, y1] = xy[s];
    const [x2, y2] = xy[e];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    for (let i = s + 1; i < e; i++) {
      const [x, y] = xy[i];
      const d = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// --- Google encoded polyline (precision 5) -----------------------------------
function encodeValue(v: number): string {
  let n = v < 0 ? ~(v << 1) : v << 1;
  let out = '';
  while (n >= 0x20) {
    out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  return out + String.fromCharCode(n + 63);
}

export function encodePolyline(points: { lat: number; lng: number }[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let out = '';
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    out += encodeValue(lat - lastLat) + encodeValue(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return out;
}

export function decodePolyline(str: string | null | undefined): { lat: number; lng: number }[] {
  if (!str) return [];
  const out: { lat: number; lng: number }[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && i < str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d; else lng += d;
    }
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}

/** Coarse (~1 km) area used for "nearby" without revealing exact location. */
export function coarseRegion(p: { lat: number; lng: number } | undefined) {
  if (!p) return { region_lat: null, region_lng: null };
  return { region_lat: Math.round(p.lat * 100) / 100, region_lng: Math.round(p.lng * 100) / 100 };
}
