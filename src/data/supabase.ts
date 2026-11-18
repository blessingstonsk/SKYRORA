// Production backend: Supabase (Postgres + RLS, Auth, Storage, Realtime).
// Every query runs as the signed-in user, so row-level security in the
// migration is the authority on who can read or write what.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { compressImage, uriToArrayBuffer } from '@/lib/image';
import { uuid } from '@/lib/format';
import type {
  Achievement, Activity, AppNotification, Challenge, Comment, Exercise,
  FollowStats, Goal, LeaderRow, Me, NotificationPrefs, Page, Profile, Route, WeightLog,
} from '@/lib/types';

import { DEFAULT_PREFS, type Backend, type Session } from './backend';
import { authStorage } from './secure-storage';

WebBrowser.maybeCompleteAuthSession();

const PAGE = 10;
const ACTIVITY_SELECT =
  '*, profile:profiles!activities_user_id_fkey(id,username,full_name,avatar_url), photos:activity_photos(storage_path), stats:activity_stats(splits,best_efforts), my_like:likes(user_id)';

type Row = Record<string, any>;

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
    realtime: { params: { eventsPerSecond: 5 } },
  });

  let currentUid: string | null = null;
  const uid = () => {
    if (!currentUid) throw new Error('Not signed in');
    return currentUid;
  };
  const toSession = (s: { user: { id: string; email?: string | null } } | null): Session | null => {
    currentUid = s?.user.id ?? null;
    return s ? { userId: s.user.id, email: s.user.email ?? null } : null;
  };

  // Signed URLs for private activity photos (1 hour), fetched in one round trip per page.
  async function hydrate(rows: Row[]): Promise<Activity[]> {
    const paths = rows.flatMap((r) => (r.photos ?? []).map((p: Row) => p.storage_path as string));
    const signed = new Map<string, string>();
    if (paths.length) {
      const { data } = await sb.storage.from('activity-photos').createSignedUrls(paths, 3600);
      data?.forEach((d) => d.signedUrl && d.path && signed.set(d.path, d.signedUrl));
    }
    return rows.map((r) => {
      const stats = Array.isArray(r.stats) ? r.stats[0] : r.stats;
      const { stats: _s, my_like, photos, ...rest } = r;
      return {
        ...rest,
        distance_m: Number(r.distance_m),
        elevation_gain_m: Number(r.elevation_gain_m),
        avg_speed_mps: r.avg_speed_mps == null ? null : Number(r.avg_speed_mps),
        max_speed_mps: r.max_speed_mps == null ? null : Number(r.max_speed_mps),
        avg_pace_s_km: r.avg_pace_s_km == null ? null : Number(r.avg_pace_s_km),
        photos: (photos ?? []).map((p: Row) => signed.get(p.storage_path)).filter(Boolean),
        liked_by_me: (my_like ?? []).length > 0,
        splits: stats?.splits ?? [],
        best_efforts: stats?.best_efforts ?? {},
      } as Activity;
    });
  }

  const activityQuery = () => sb.from('activities').select(ACTIVITY_SELECT).eq('my_like.user_id', uid());

  async function followingIds(): Promise<string[]> {
    const rows = check(await sb.from('followers').select('following_id').eq('follower_id', uid()).eq('status', 'accepted'));
    return (rows as Row[]).map((r) => r.following_id);
  }

  async function uploadTo(bucket: string, path: string, uri: string) {
    const img = await compressImage(uri, bucket === 'avatars' ? 512 : 1600);
    const body = await uriToArrayBuffer(img.uri);
    const { error } = await sb.storage.from(bucket).upload(path, body, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error(error.message);
    return img;
  }

  const backend: Backend = {
    mode: 'supabase',

    async getSession() {
      const { data } = await sb.auth.getSession();
      return toSession(data.session);
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toSession(s)));
      return () => data.subscription.unsubscribe();
    },
    async signUp(email, password, fullName) {
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { full_name: fullName }, emailRedirectTo: makeRedirectUri({ path: 'sign-in' }) },
      });
      if (error) throw new Error(error.message);
      return { needsConfirmation: !data.session };
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signInWithGoogle() {
      const redirectTo = makeRedirectUri({ path: 'auth-callback' });
      if (Platform.OS === 'web') {
        const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
        if (error) throw new Error(error.message);
        return;
      }
      const { data, error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) throw new Error(error?.message ?? 'Could not start Google sign-in');
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== 'success') return;
      const code = /[?&#]code=([^&#]+)/.exec(res.url)?.[1];
      if (!code) throw new Error('Google sign-in was cancelled');
      const ex = await sb.auth.exchangeCodeForSession(decodeURIComponent(code));
      if (ex.error) throw new Error(ex.error.message);
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: makeRedirectUri({ path: 'sign-in' }) });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async deleteAccount() {
      // Storage objects are removed by the RPC too; explicit removal keeps buckets tidy if RPC policies change.
      check(await sb.rpc('delete_my_account'));
      await sb.auth.signOut();
    },

    async getMe(): Promise<Me> {
      const id = uid();
      const [p, priv, user] = await Promise.all([
        sb.from('profiles').select('*').eq('id', id).single(),
        sb.from('profile_private').select('*').eq('user_id', id).single(),
        sb.auth.getUser(),
      ]);
      const pr = check(priv) as Row;
      return {
        profile: check(p) as Profile,
        private: { ...pr, height_cm: pr.height_cm == null ? null : Number(pr.height_cm), weight_kg: pr.weight_kg == null ? null : Number(pr.weight_kg) } as Me['private'],
        email: user.data.user?.email ?? null,
      };
    },
    async updateProfile(patch) {
      check(await sb.from('profiles').update(patch).eq('id', uid()));
    },
    async updatePrivate(patch) {
      check(await sb.from('profile_private').update(patch).eq('user_id', uid()));
    },
    async uploadAvatar(uri) {
      const path = `${uid()}/avatar-${Date.now()}.jpg`;
      await uploadTo('avatars', path, uri);
      const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      await backend.updateProfile({ avatar_url: url });
      return url;
    },
    async getProfile(id) {
      const { data } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
      return (data as Profile) ?? null;
    },
    async searchPeople(q) {
      const term = q.replace(/[%_,()]/g, '').trim();
      if (!term) return [];
      return check(await sb.from('profiles').select('*').or(`username.ilike.%${term}%,full_name.ilike.%${term}%`).limit(20)) as Profile[];
    },
    async suggestedPeople() {
      const ids = await followingIds();
      const exclude = [uid(), ...ids];
      return check(await sb.from('profiles').select('*').eq('visibility', 'public').not('id', 'in', `(${exclude.join(',')})`).limit(10)) as Profile[];
    },
    async followStats(userId): Promise<FollowStats> {
      const [fol, ing, rel] = await Promise.all([
        sb.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId).eq('status', 'accepted'),
        sb.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', userId).eq('status', 'accepted'),
        sb.from('followers').select('status').eq('follower_id', uid()).eq('following_id', userId).maybeSingle(),
      ]);
      const status: FollowStats['status'] =
        userId === uid() ? 'self' : !rel.data ? 'none' : (rel.data as Row).status === 'pending' ? 'pending' : 'following';
      return { followers: fol.count ?? 0, following: ing.count ?? 0, status };
    },
    async follow(userId) {
      check(await sb.from('followers').insert({ follower_id: uid(), following_id: userId }));
    },
    async unfollow(userId) {
      check(await sb.from('followers').delete().eq('follower_id', uid()).eq('following_id', userId));
    },
    async acceptFollow(userId) {
      check(await sb.from('followers').update({ status: 'accepted' }).eq('follower_id', userId).eq('following_id', uid()));
    },
    async declineFollow(userId) {
      check(await sb.from('followers').delete().eq('follower_id', userId).eq('following_id', uid()));
    },

    async feed(cursor): Promise<Page<Activity>> {
      const ids = [uid(), ...(await followingIds())];
      let q = activityQuery().in('user_id', ids).order('started_at', { ascending: false }).limit(PAGE);
      if (cursor) q = q.lt('started_at', cursor);
      const rows = check(await q) as Row[];
      const items = await hydrate(rows);
      return { items, nextCursor: rows.length === PAGE ? rows[rows.length - 1].started_at : null };
    },
    async myActivities() {
      // Lightweight columns for analytics; capped at 2 years.
      const since = new Date(Date.now() - 730 * 86400000).toISOString();
      const rows = check(
        await sb.from('activities')
          .select('id,user_id,type,title,visibility,started_at,ended_at,moving_time_s,elapsed_time_s,distance_m,elevation_gain_m,avg_speed_mps,max_speed_mps,avg_pace_s_km,calories,steps,avg_hr,max_hr,map_polyline,like_count,comment_count,created_at,description,region_lat,region_lng, stats:activity_stats(best_efforts), workout:workouts(sets:workout_sets(exercise_id,set_index,reps,weight_kg,rest_s,duration_s, exercise:exercises(name)))')
          .eq('user_id', uid()).gte('started_at', since).order('started_at', { ascending: false }).limit(2000),
      ) as Row[];
      return rows.map((r) => {
        const stats = Array.isArray(r.stats) ? r.stats[0] : r.stats;
        const workout = Array.isArray(r.workout) ? r.workout[0] : r.workout;
        return {
          ...r,
          distance_m: Number(r.distance_m),
          elevation_gain_m: Number(r.elevation_gain_m),
          avg_pace_s_km: r.avg_pace_s_km == null ? null : Number(r.avg_pace_s_km),
          best_efforts: stats?.best_efforts ?? {},
          sets: (workout?.sets ?? []).map((s: Row) => ({ ...s, weight_kg: s.weight_kg == null ? null : Number(s.weight_kg), exercise_name: s.exercise?.name ?? '' })),
        } as Activity;
      });
    },
    async userActivities(userId, cursor) {
      let q = activityQuery().eq('user_id', userId).order('started_at', { ascending: false }).limit(PAGE);
      if (cursor) q = q.lt('started_at', cursor);
      const rows = check(await q) as Row[];
      return { items: await hydrate(rows), nextCursor: rows.length === PAGE ? rows[rows.length - 1].started_at : null };
    },
    async getActivity(id) {
      const { data } = await activityQuery().eq('id', id).maybeSingle();
      if (!data) return null;
      const [a] = await hydrate([data as Row]);
      if (a.type === 'strength') {
        const { data: w } = await sb.from('workouts')
          .select('sets:workout_sets(exercise_id,set_index,reps,weight_kg,rest_s,duration_s, exercise:exercises(name))')
          .eq('activity_id', id).maybeSingle();
        a.sets = ((w as Row | null)?.sets ?? [])
          .map((s: Row) => ({ ...s, weight_kg: s.weight_kg == null ? null : Number(s.weight_kg), exercise_name: s.exercise?.name ?? '' }))
          .sort((x: Row, y: Row) => x.set_index - y.set_index);
      }
      return a;
    },
    async getActivityPoints(id) {
      const rows = check(await sb.from('activity_points').select('lat,lng,altitude_m,speed_mps,heart_rate,recorded_at').eq('activity_id', id).order('seq').limit(20000)) as Row[];
      return rows.map((r) => ({ lat: r.lat, lng: r.lng, alt: r.altitude_m, speed: r.speed_mps, hr: r.heart_rate, t: new Date(r.recorded_at).getTime() }));
    },
    async saveActivity(d, mapPolyline, region) {
      const me = uid();
      const row = {
        client_id: d.client_id, user_id: me, type: d.type, title: d.title, description: d.description ?? null,
        visibility: d.visibility, started_at: d.started_at, ended_at: d.ended_at, moving_time_s: d.moving_time_s,
        elapsed_time_s: d.elapsed_time_s, distance_m: d.distance_m, elevation_gain_m: d.elevation_gain_m,
        avg_speed_mps: d.avg_speed_mps, max_speed_mps: d.max_speed_mps, avg_pace_s_km: d.avg_pace_s_km,
        calories: d.calories, steps: d.steps, avg_hr: d.avg_hr, max_hr: d.max_hr, map_polyline: mapPolyline, ...region,
      };
      // ON CONFLICT DO NOTHING makes retries from the offline outbox safe.
      check(await sb.from('activities').upsert(row, { onConflict: 'client_id', ignoreDuplicates: true }));
      const saved = check(await sb.from('activities').select('id').eq('client_id', d.client_id).single()) as Row;
      const id = saved.id as string;

      for (let i = 0; i < d.points.length; i += 500) {
        const chunk = d.points.slice(i, i + 500).map((p, j) => ({
          activity_id: id, seq: i + j, lat: p.lat, lng: p.lng, altitude_m: p.alt ?? null, speed_mps: p.speed ?? null,
          accuracy_m: p.accuracy ?? null, heart_rate: p.hr ?? null, recorded_at: new Date(p.t).toISOString(),
        }));
        check(await sb.from('activity_points').upsert(chunk, { onConflict: 'activity_id,seq', ignoreDuplicates: true }));
      }
      check(await sb.from('activity_stats').upsert({ activity_id: id, splits: d.splits, best_efforts: d.best_efforts }, { onConflict: 'activity_id' }));

      if (d.sets?.length) {
        check(await sb.from('workouts').upsert({ activity_id: id, user_id: me }, { onConflict: 'activity_id', ignoreDuplicates: true }));
        const w = check(await sb.from('workouts').select('id').eq('activity_id', id).single()) as Row;
        const { count } = await sb.from('workout_sets').select('id', { count: 'exact', head: true }).eq('workout_id', w.id);
        if (!count) {
          check(await sb.from('workout_sets').insert(d.sets.map((s) => ({
            workout_id: w.id, exercise_id: s.exercise_id, set_index: s.set_index, reps: s.reps,
            weight_kg: s.weight_kg, rest_s: s.rest_s, duration_s: s.duration_s,
          }))));
        }
      }
      if (d.photo_uris.length) await backend.addActivityPhotos(id, d.photo_uris);
      return (await backend.getActivity(id))!;
    },
    async updateActivity(id, patch) {
      check(await sb.from('activities').update(patch).eq('id', id).eq('user_id', uid()));
    },
    async deleteActivity(id) {
      const photos = check(await sb.from('activity_photos').select('storage_path').eq('activity_id', id)) as Row[];
      if (photos.length) await sb.storage.from('activity-photos').remove(photos.map((p) => p.storage_path));
      check(await sb.from('activities').delete().eq('id', id).eq('user_id', uid()));
    },
    async addActivityPhotos(id, uris) {
      for (const uri of uris.slice(0, 6)) {
        const path = `${uid()}/${id}/${uuid()}.jpg`;
        const img = await uploadTo('activity-photos', path, uri);
        check(await sb.from('activity_photos').insert({ activity_id: id, user_id: uid(), storage_path: path, width: img.width, height: img.height }));
      }
    },
    async nearbyActivities(type) {
      const mine = check(await sb.from('activities').select('region_lat,region_lng').eq('user_id', uid()).not('region_lat', 'is', null).order('started_at', { ascending: false }).limit(1)) as Row[];
      let q = activityQuery().eq('visibility', 'public').neq('user_id', uid()).order('started_at', { ascending: false }).limit(20);
      if (mine[0]) {
        q = q.gte('region_lat', mine[0].region_lat - 0.2).lte('region_lat', mine[0].region_lat + 0.2)
             .gte('region_lng', mine[0].region_lng - 0.2).lte('region_lng', mine[0].region_lng + 0.2);
      }
      if (type) q = q.eq('type', type);
      return hydrate(check(await q) as Row[]);
    },
    async searchActivities(q) {
      const term = q.replace(/[%_,()]/g, '').trim();
      if (!term) return [];
      return hydrate(check(await activityQuery().ilike('title', `%${term}%`).order('started_at', { ascending: false }).limit(20)) as Row[]);
    },

    async setLike(activityId, liked) {
      if (liked) check(await sb.from('likes').upsert({ activity_id: activityId, user_id: uid() }, { ignoreDuplicates: true }));
      else check(await sb.from('likes').delete().eq('activity_id', activityId).eq('user_id', uid()));
    },
    async comments(activityId) {
      return check(await sb.from('comments').select('*, profile:profiles(id,username,full_name,avatar_url)').eq('activity_id', activityId).order('created_at').limit(200)) as Comment[];
    },
    async addComment(activityId, body) {
      return check(await sb.from('comments').insert({ activity_id: activityId, user_id: uid(), body }).select('*, profile:profiles(id,username,full_name,avatar_url)').single()) as Comment;
    },
    async deleteComment(id) {
      check(await sb.from('comments').delete().eq('id', id));
    },

    async challenges() {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [all, mine] = await Promise.all([
        sb.from('challenges').select('*, participants:challenge_participants(count)').gte('ends_at', since).order('ends_at'),
        sb.from('challenge_participants').select('challenge_id,progress,completed_at').eq('user_id', uid()),
      ]);
      const my = new Map((check(mine) as Row[]).map((r) => [r.challenge_id, r]));
      return (check(all) as Row[]).map((c) => ({
        ...c,
        target_value: Number(c.target_value),
        participant_count: c.participants?.[0]?.count ?? 0,
        my_progress: my.has(c.id) ? Number(my.get(c.id)!.progress) : null,
        my_completed_at: my.get(c.id)?.completed_at ?? null,
      })) as Challenge[];
    },
    async challenge(id) {
      return (await backend.challenges()).find((c) => c.id === id) ?? null;
    },
    async challengeLeaderboard(id) {
      const rows = check(await sb.rpc('challenge_leaderboard', { chal: id, lim: 50 })) as Row[];
      return rows.map((r) => ({ ...r, value: Number(r.progress), rank: Number(r.rank), completed: !!r.completed_at })) as LeaderRow[];
    },
    async joinChallenge(id) {
      check(await sb.from('challenge_participants').insert({ challenge_id: id, user_id: uid() }));
    },
    async leaveChallenge(id) {
      check(await sb.from('challenge_participants').delete().eq('challenge_id', id).eq('user_id', uid()));
    },
    async achievements(userId) {
      const [all, earned] = await Promise.all([
        sb.from('achievements').select('*').order('created_at'),
        sb.from('user_achievements').select('achievement_id,earned_at').eq('user_id', userId),
      ]);
      const e = new Map((check(earned) as Row[]).map((r) => [r.achievement_id, r.earned_at]));
      return (check(all) as Row[]).map((a) => ({ ...a, earned_at: e.get(a.id) ?? null })) as Achievement[];
    },
    async leaderboard(metric, since, scope) {
      const rows = check(await sb.rpc('leaderboard', { metric, since: since.toISOString(), scope, lim: 50 })) as Row[];
      return rows.map((r) => ({ ...r, value: Number(r.value), rank: Number(r.rank) })) as LeaderRow[];
    },

    async goals() {
      const rows = check(await sb.from('goals').select('*').eq('user_id', uid()).neq('status', 'archived').order('created_at')) as Row[];
      return rows.map((g) => ({ ...g, target_value: Number(g.target_value), start_value: g.start_value == null ? null : Number(g.start_value) })) as Goal[];
    },
    async createGoal(g) {
      return check(await sb.from('goals').insert({ ...g, user_id: uid() }).select('*').single()) as Goal;
    },
    async updateGoal(id, patch) {
      check(await sb.from('goals').update(patch).eq('id', id));
    },
    async deleteGoal(id) {
      check(await sb.from('goals').delete().eq('id', id));
    },
    async weightLogs() {
      const rows = check(await sb.from('weight_logs').select('id,weight_kg,logged_on,note').eq('user_id', uid()).order('logged_on').limit(1000)) as Row[];
      return rows.map((r) => ({ ...r, weight_kg: Number(r.weight_kg) })) as WeightLog[];
    },
    async addWeight(kg, date, note) {
      check(await sb.from('weight_logs').upsert({ user_id: uid(), weight_kg: kg, logged_on: date, note: note ?? null }, { onConflict: 'user_id,logged_on' }));
      await backend.updatePrivate({ weight_kg: kg });
    },
    async deleteWeight(id) {
      check(await sb.from('weight_logs').delete().eq('id', id));
    },

    async notifications() {
      return check(await sb.from('notifications').select('*, actor:profiles!notifications_actor_id_fkey(id,username,full_name,avatar_url)').eq('user_id', uid()).order('created_at', { ascending: false }).limit(50)) as AppNotification[];
    },
    async markRead(id) {
      let q = sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid()).is('read_at', null);
      if (id) q = q.eq('id', id);
      check(await q);
    },
    async notificationPrefs() {
      const { data } = await sb.from('notification_prefs').select('*').eq('user_id', uid()).maybeSingle();
      return { ...DEFAULT_PREFS, ...((data as NotificationPrefs) ?? {}) };
    },
    async updateNotificationPrefs(p) {
      check(await sb.from('notification_prefs').upsert({ user_id: uid(), ...p }));
    },
    subscribeNotifications(cb) {
      const ch = sb
        .channel(`notif-${uid()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid()}` }, () => cb())
        .subscribe();
      return () => { sb.removeChannel(ch); };
    },

    async exercises() {
      const rows = check(await sb.from('exercises').select('*').order('name')) as Row[];
      return rows.map((e) => ({ ...e, is_custom: e.created_by != null })) as Exercise[];
    },
    async createExercise(name, category, muscle) {
      const e = check(await sb.from('exercises').insert({ name, category, muscle_group: muscle, created_by: uid() }).select('*').single()) as Row;
      return { ...e, is_custom: true } as Exercise;
    },
    async routes(type, q) {
      let query = sb.from('routes').select('*').order('times_completed', { ascending: false }).limit(20);
      if (type) query = query.eq('type', type);
      if (q) query = query.ilike('name', `%${q.replace(/[%_,()]/g, '')}%`);
      return (check(await query) as Row[]).map((r) => ({ ...r, distance_m: Number(r.distance_m), elevation_gain_m: Number(r.elevation_gain_m) })) as Route[];
    },
  };

  return backend;
}
