// Live activity recording state. Survives app restarts via a periodic snapshot,
// so a crash or OS kill mid-run never loses the workout.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { estimateCalories, estimateSteps } from '@/lib/calories';
import { autoTitle, uuid } from '@/lib/format';
import { acceptFix, bestEfforts, computeSplits, haversine, MAX_SPEED, paceSecPerKm } from '@/lib/geo';
import type { ActivityDraft, ActivityType, GeoPoint, Visibility } from '@/lib/types';

const SNAP_KEY = 'skyro.recording.v1';

export type RecStatus = 'idle' | 'recording' | 'paused' | 'finished';
export type GpsStatus = 'off' | 'searching' | 'weak' | 'good';

interface RecorderState {
  status: RecStatus;
  type: ActivityType;
  clientId: string;
  startedAt: number | null;
  movingMs: number;
  resumedAt: number | null;
  points: GeoPoint[];
  breakNext: boolean;
  distance: number;
  elevation: number;
  lastAlt: number | null;
  maxSpeed: number;
  steps: number | null;
  stepBase: number;
  hr: number | null;
  hrSamples: number[];
  gps: GpsStatus;
  accuracy: number | null;
  lastFix: GeoPoint | null;
  draft: ActivityDraft | null;
  simulated: boolean;

  setType(t: ActivityType): void;
  start(simulated?: boolean): void;
  pause(): void;
  resume(): void;
  finish(opts: { weightKg?: number | null; heightCm?: number | null; visibility?: Visibility }): ActivityDraft;
  discard(): void;
  ingest(locs: GeoPoint[]): void;
  setSteps(n: number): void;
  setHeartRate(bpm: number | null): void;
  setGps(g: GpsStatus, acc?: number | null): void;
  updateDraft(patch: Partial<ActivityDraft>): void;
  restore(): Promise<boolean>;
}

const initial = {
  status: 'idle' as RecStatus,
  clientId: '',
  startedAt: null,
  movingMs: 0,
  resumedAt: null,
  points: [] as GeoPoint[],
  breakNext: false,
  distance: 0,
  elevation: 0,
  lastAlt: null,
  maxSpeed: 0,
  steps: null,
  stepBase: 0,
  hr: null,
  hrSamples: [] as number[],
  accuracy: null,
  lastFix: null,
  draft: null,
  simulated: false,
};

let snapTimer: ReturnType<typeof setTimeout> | null = null;
function snapshot(s: RecorderState, immediate = false) {
  const write = () => {
    const { status, type, clientId, startedAt, movingMs, resumedAt, points, distance, elevation, lastAlt, maxSpeed, steps, hrSamples, draft, simulated } = useRecorder.getState();
    if (status === 'idle') {
      AsyncStorage.removeItem(SNAP_KEY).catch(() => {});
      return;
    }
    AsyncStorage.setItem(SNAP_KEY, JSON.stringify({ status, type, clientId, startedAt, movingMs, resumedAt, points, distance, elevation, lastAlt, maxSpeed, steps, hrSamples, draft, simulated })).catch(() => {});
  };
  void s;
  if (snapTimer) clearTimeout(snapTimer);
  if (immediate) write();
  else snapTimer = setTimeout(write, 4000);
}

/** Moving time in ms right now. */
export function movingMsNow(s: Pick<RecorderState, 'movingMs' | 'resumedAt' | 'status'>, now = Date.now()) {
  return s.movingMs + (s.status === 'recording' && s.resumedAt ? now - s.resumedAt : 0);
}

export const useRecorder = create<RecorderState>((set, get) => ({
  ...initial,
  type: 'run',
  gps: 'off',

  setType: (type) => set({ type }),

  start: (simulated = false) => {
    const now = Date.now();
    set({ ...initial, type: get().type, gps: get().gps, clientId: uuid(), status: 'recording', startedAt: now, resumedAt: now, simulated });
    snapshot(get(), true);
  },

  pause: () => {
    const s = get();
    if (s.status !== 'recording') return;
    set({ status: 'paused', movingMs: movingMsNow(s), resumedAt: null, breakNext: true });
    snapshot(get(), true);
  },

  resume: () => {
    if (get().status !== 'paused') return;
    set({ status: 'recording', resumedAt: Date.now() });
    snapshot(get(), true);
  },

  ingest: (locs) => {
    const s = get();
    const last = locs[locs.length - 1];
    if (last) {
      const acc = last.accuracy ?? null;
      set({ lastFix: last, accuracy: acc, gps: acc == null ? 'good' : acc <= 15 ? 'good' : acc <= 35 ? 'weak' : 'searching' });
    }
    if (s.status !== 'recording') return;
    let { distance, elevation, lastAlt, maxSpeed, breakNext } = s;
    const points = s.points.slice();
    const limit = MAX_SPEED[s.type] ?? 30;
    for (const p of locs) {
      const prev = points[points.length - 1];
      if (!acceptFix(prev, p, limit)) continue;
      if (prev && !breakNext) {
        const d = haversine(prev, p);
        distance += d;
        const dt = (p.t - prev.t) / 1000;
        if (dt > 0) maxSpeed = Math.max(maxSpeed, Math.min(limit, p.speed ?? d / dt));
      }
      breakNext = false;
      if (p.alt != null) {
        if (lastAlt == null) lastAlt = p.alt;
        else if (p.alt - lastAlt >= 3) { elevation += p.alt - lastAlt; lastAlt = p.alt; }
        else if (p.alt - lastAlt <= -3) lastAlt = p.alt;
      }
      points.push(p);
    }
    set({ points, distance, elevation, lastAlt, maxSpeed, breakNext });
    snapshot(get());
  },

  setSteps: (n) => set({ steps: n }),
  setHeartRate: (bpm) => set((s) => ({ hr: bpm, hrSamples: bpm && s.status === 'recording' ? [...s.hrSamples, bpm] : s.hrSamples })),
  setGps: (gps, accuracy) => set({ gps, accuracy: accuracy ?? get().accuracy }),

  finish: ({ weightKg, heightCm, visibility = 'public' }) => {
    const s = get();
    const now = Date.now();
    const moving = Math.round(movingMsNow(s, now) / 1000);
    const started = s.startedAt ?? now;
    const dist = Math.round(s.distance);
    const hr = s.hrSamples;
    const draft: ActivityDraft = {
      client_id: s.clientId || uuid(),
      type: s.type,
      title: autoTitle(s.type, new Date(started)),
      description: null,
      visibility,
      started_at: new Date(started).toISOString(),
      ended_at: new Date(now).toISOString(),
      moving_time_s: moving,
      elapsed_time_s: Math.round((now - started) / 1000),
      distance_m: dist,
      elevation_gain_m: Math.round(s.elevation * 10) / 10,
      avg_speed_mps: moving > 0 ? dist / moving : null,
      max_speed_mps: s.maxSpeed || null,
      avg_pace_s_km: paceSecPerKm(dist, moving),
      calories: estimateCalories(s.type, moving, dist, weightKg),
      steps: s.steps ?? estimateSteps(s.type, dist, heightCm),
      avg_hr: hr.length ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null,
      max_hr: hr.length ? Math.max(...hr) : null,
      points: s.points,
      splits: computeSplits(s.points),
      best_efforts: s.type === 'run' ? bestEfforts(s.points) : {},
      photo_uris: [],
    };
    set({ status: 'finished', draft, movingMs: moving * 1000, resumedAt: null });
    snapshot(get(), true);
    return draft;
  },

  updateDraft: (patch) => {
    const d = get().draft;
    if (d) set({ draft: { ...d, ...patch } });
    snapshot(get());
  },

  discard: () => {
    set({ ...initial, type: get().type, gps: get().gps });
    snapshot(get(), true);
  },

  restore: async () => {
    try {
      const raw = await AsyncStorage.getItem(SNAP_KEY);
      if (!raw) return false;
      const snap = JSON.parse(raw);
      if (!snap?.status || snap.status === 'idle') return false;
      // A run interrupted while "recording" resumes as paused so no phantom time is added.
      const status: RecStatus = snap.status === 'recording' ? 'paused' : snap.status;
      const movingMs = snap.status === 'recording' && snap.resumedAt ? snap.movingMs + Math.max(0, (snap.points.at(-1)?.t ?? snap.resumedAt) - snap.resumedAt) : snap.movingMs;
      set({ ...initial, ...snap, status, movingMs, resumedAt: null, breakNext: true, hrSamples: snap.hrSamples ?? [] });
      return true;
    } catch {
      return false;
    }
  },
}));
