// Offline-first save path. Finished activities are written to a durable outbox
// first, then uploaded. If the network is down (or the upload fails), they stay
// queued and are retried automatically when connectivity returns.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';

import { coarseRegion, encodePolyline, simplify, trimForPrivacy } from '@/lib/geo';
import type { Activity, ActivityDraft } from '@/lib/types';

import { api } from './index';

const KEY = 'skyro.outbox.v1';

interface OutboxState {
  pending: ActivityDraft[];
  syncing: boolean;
  lastError: string | null;
  loaded: boolean;
}

export const useOutbox = create<OutboxState>(() => ({ pending: [], syncing: false, lastError: null, loaded: false }));

async function read(): Promise<ActivityDraft[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
  } catch {
    return [];
  }
}
async function write(list: ActivityDraft[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
  useOutbox.setState({ pending: list });
}

export async function loadOutbox() {
  useOutbox.setState({ pending: await read(), loaded: true });
}

/** Build the shareable, privacy-trimmed polyline from raw points. */
export async function shareableRoute(d: ActivityDraft) {
  if (!d.points.length) return { polyline: null, region: coarseRegion(undefined) };
  let trimM = 200;
  let hide = true;
  try {
    const me = await api.getMe();
    trimM = me.private.route_trim_m;
    hide = me.private.hide_route_ends;
  } catch {
    // Offline: fall back to the safe default (trim 200 m).
  }
  const visible = hide ? trimForPrivacy(d.points, trimM) : d.points;
  const simplified = simplify(visible, 3);
  return {
    polyline: simplified.length > 1 ? encodePolyline(simplified) : null,
    region: coarseRegion(visible[0] ?? d.points[Math.floor(d.points.length / 2)]),
  };
}

/** Queue then attempt upload. Resolves with the saved activity, or null if queued offline. */
export async function saveDraft(draft: ActivityDraft): Promise<Activity | null> {
  const list = await read();
  if (!list.some((d) => d.client_id === draft.client_id)) await write([...list, draft]);
  const done = await flushOutbox();
  return done.get(draft.client_id) ?? null;
}

let flushing: Promise<Map<string, Activity>> | null = null;

export function flushOutbox(): Promise<Map<string, Activity>> {
  if (flushing) return flushing;
  flushing = (async () => {
    const saved = new Map<string, Activity>();
    const net = await NetInfo.fetch();
    if (api.mode === 'supabase' && net.isConnected === false) return saved;
    useOutbox.setState({ syncing: true, lastError: null });
    let list = await read();
    for (const draft of [...list]) {
      try {
        const { polyline, region } = await shareableRoute(draft);
        const a = await api.saveActivity(draft, polyline, region);
        saved.set(draft.client_id, a);
        list = list.filter((d) => d.client_id !== draft.client_id);
        await write(list);
      } catch (e) {
        useOutbox.setState({ lastError: e instanceof Error ? e.message : String(e) });
        break; // keep order; retry later
      }
    }
    useOutbox.setState({ syncing: false });
    return saved;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Retry whenever connectivity comes back. Returns an unsubscribe function. */
export function watchConnectivity(onSynced: () => void) {
  return NetInfo.addEventListener((s) => {
    if (s.isConnected && useOutbox.getState().pending.length) {
      flushOutbox().then((m) => m.size && onSynced());
    }
  });
}
