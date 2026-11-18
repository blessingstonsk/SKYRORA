// GPS tracking service.
//  - Native: background location task (keeps recording with the screen off) using
//    a foreground service on Android and the location background mode on iOS.
//  - Web: browser geolocation via watchPositionAsync.
//  - Simulator: synthetic route for demos / testing without moving.
// Battery: balanced accuracy + distance filter; ride uses a wider filter.
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { generateTrack } from '@/data/demo-seed';
import { useRecorder } from '@/state/recorder';

import type { ActivityType, GeoPoint } from './types';

export const LOCATION_TASK = 'skyro-location-task';

const toPoint = (l: Location.LocationObject): GeoPoint => ({
  lat: l.coords.latitude,
  lng: l.coords.longitude,
  alt: l.coords.altitude,
  speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
  accuracy: l.coords.accuracy,
  t: l.timestamp,
});

// Must be defined at module scope so the OS can wake the JS runtime for it.
if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const rec = useRecorder.getState();
    if (rec.status === 'idle') await rec.restore();
    useRecorder.getState().ingest(data.locations.map(toPoint));
  });
}

let watchSub: Location.LocationSubscription | null = null;
let pedoSub: { remove(): void } | null = null;
let simTimer: ReturnType<typeof setInterval> | null = null;

/** True when some GPS source is feeding the recorder in this JS runtime. */
export async function isTracking(): Promise<boolean> {
  if (simTimer || watchSub) return true;
  if (Platform.OS === 'web') return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

export async function requestLocationPermission(): Promise<'granted' | 'foreground-only' | 'denied'> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  if (Platform.OS === 'web') return 'granted';
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted' ? 'granted' : 'foreground-only';
  } catch {
    return 'foreground-only';
  }
}

/** Warm up GPS before the user taps Start so we can show signal quality. */
export async function startGpsPreview(): Promise<boolean> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    const p = await requestLocationPermission();
    if (p === 'denied') {
      useRecorder.getState().setGps('off');
      return false;
    }
  }
  useRecorder.getState().setGps('searching');
  await stopWatch();
  watchSub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 3 },
    (l) => useRecorder.getState().ingest([toPoint(l)]),
  );
  return true;
}

async function stopWatch() {
  watchSub?.remove();
  watchSub = null;
}

export async function startTracking(type: ActivityType, opts: { simulate?: boolean } = {}) {
  if (opts.simulate) {
    startSimulation(type);
    return;
  }
  const distanceInterval = type === 'ride' ? 8 : 4;
  if (Platform.OS !== 'web') {
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status === 'granted') {
      await stopWatch(); // background task supersedes the foreground preview
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        distanceInterval,
        timeInterval: 2000,
        activityType: type === 'ride' ? Location.ActivityType.OtherNavigation : Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'SKYRO is recording',
          notificationBody: 'Your activity is being tracked. Tap to return.',
          notificationColor: '#2EE6C5',
        },
      });
    } else if (!watchSub) {
      await startGpsPreview();
    }
    if (type === 'walk' || type === 'run' || type === 'hike') startPedometer();
  } else if (!watchSub) {
    await startGpsPreview();
  }
}

export async function stopTracking() {
  if (simTimer) clearInterval(simTimer);
  simTimer = null;
  pedoSub?.remove();
  pedoSub = null;
  await stopWatch();
  if (Platform.OS !== 'web') {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    } catch {
      // task may not be registered yet
    }
  }
}

async function startPedometer() {
  try {
    if (!(await Pedometer.isAvailableAsync())) return;
    const perm = await Pedometer.requestPermissionsAsync();
    if (!perm.granted) return;
    pedoSub = Pedometer.watchStepCount((r) => {
      if (useRecorder.getState().status === 'recording') useRecorder.getState().setSteps(r.steps);
    });
  } catch {
    // pedometer unsupported: steps are estimated from distance instead
  }
}

/** Synthetic GPS: follows a generated loop at a realistic speed, 1 fix/second. */
function startSimulation(type: ActivityType) {
  if (simTimer) clearInterval(simTimer);
  const speed = type === 'ride' ? 7 : type === 'walk' || type === 'hike' ? 1.45 : 3.0;
  let seed = Date.now() % 100000;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fix = useRecorder.getState().lastFix;
  const track = generateTrack(rand, Date.now(), type === 'ride' ? 20000 : 6000, speed, fix ? { lat: fix.lat, lng: fix.lng } : undefined, 1);
  const t0 = Date.now();
  let i = 0;
  useRecorder.getState().setGps('good', 5);
  simTimer = setInterval(() => {
    const st = useRecorder.getState();
    if (st.status === 'idle' || st.status === 'finished') return;
    // Advance along the track while recording; hold position while paused.
    if (st.status === 'recording') i = Math.min(track.length - 1, i + 1);
    const p = track[i];
    const hr = type === 'run' ? 138 + Math.round(Math.sin(i / 40) * 10 + rand() * 6) : null;
    st.ingest([{ ...p, t: Date.now(), accuracy: 4 + rand() * 3, speed: speed * (0.9 + rand() * 0.2) }]);
    if (hr) st.setHeartRate(hr);
    if (type === 'walk' || type === 'run') st.setSteps(Math.round(((Date.now() - t0) / 1000) * (type === 'run' ? 2.8 : 1.8)));
  }, 1000);
}

/** Rough battery drain estimate for the pre-start screen. */
export async function batteryEstimate(type: ActivityType): Promise<{ level: number | null; perHour: number; hours: number | null }> {
  const perHour = type === 'ride' ? 7 : 9; // % per hour with High accuracy + screen mostly off
  try {
    const level = await Battery.getBatteryLevelAsync();
    if (level < 0) return { level: null, perHour, hours: null };
    const pct = Math.round(level * 100);
    return { level: pct, perHour, hours: Math.round((pct / perHour) * 10) / 10 };
  } catch {
    return { level: null, perHour, hours: null };
  }
}

/** Steps today (iOS supports historical queries; elsewhere returns null). */
export async function stepsToday(): Promise<number | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    if (!(await Pedometer.isAvailableAsync())) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const r = await Pedometer.getStepCountAsync(start, new Date());
    return r.steps;
  } catch {
    return null;
  }
}
