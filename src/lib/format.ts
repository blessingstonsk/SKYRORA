import type { ActivityType } from './types';

export const ACTIVITY_META: Record<ActivityType, { label: string; icon: string; gps: boolean; verb: string }> = {
  run: { label: 'Run', icon: 'run-fast', gps: true, verb: 'Running' },
  walk: { label: 'Walk', icon: 'walk', gps: true, verb: 'Walking' },
  ride: { label: 'Ride', icon: 'bike', gps: true, verb: 'Cycling' },
  hike: { label: 'Hike', icon: 'hiking', gps: true, verb: 'Hiking' },
  strength: { label: 'Strength', icon: 'dumbbell', gps: false, verb: 'Training' },
  yoga: { label: 'Yoga', icon: 'yoga', gps: false, verb: 'Yoga' },
  swim: { label: 'Swim', icon: 'swim', gps: false, verb: 'Swimming' },
  other: { label: 'Workout', icon: 'lightning-bolt', gps: false, verb: 'Workout' },
};

export function km(m: number, digits = 2): string {
  return (m / 1000).toFixed(m >= 100000 ? 0 : digits);
}

export function duration(s: number, compact = false): string {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (compact) {
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${sec}s`;
  }
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

export function pace(sPerKm: number | null | undefined): string {
  if (!sPerKm || !Number.isFinite(sPerKm) || sPerKm > 3600) return '–:––';
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

export function speedKmh(mps: number | null | undefined): string {
  return mps ? (mps * 3.6).toFixed(1) : '0.0';
}

export function int(n: number | null | undefined): string {
  return Math.round(n ?? 0).toLocaleString('en-US');
}

export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function dayKey(d: Date | string | number): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function initials(name: string | null | undefined, fallback = '?'): string {
  if (!name) return fallback;
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function autoTitle(type: ActivityType, start: Date | string): string {
  const h = new Date(start).getHours();
  const part = h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night';
  return `${part} ${ACTIVITY_META[type].label}`;
}

export function uuid(): string {
  // RFC4122 v4 — crypto.randomUUID is available on Hermes and modern browsers.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
