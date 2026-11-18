// Demo backend: a local, on-device database persisted in AsyncStorage.
// Mirrors the Supabase backend's behaviour (visibility rules, counters,
// notifications, challenge progress) so the full app can be explored offline.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { dayKey, uuid } from '@/lib/format';
import { computeRecords, currentStreak, RECORD_META } from '@/lib/stats';
import type {
  Activity, AppNotification, Challenge, Comment, Exercise, LeaderRow, Me, NotificationType, Visibility,
} from '@/lib/types';

import type { Backend, Session } from './backend';
import { blankPrivate, buildSeed, DEFAULT_PREFS_LOCAL, ME, pickActor, recount, type DB } from './demo-seed';

const KEY = 'skyro.demo.db.v3';
const PAGE = 10;
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export function createLocalBackend(): Backend {
  let db: DB | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const authListeners = new Set<(s: Session | null) => void>();
  const notifListeners = new Set<() => void>();

  async function load(): Promise<DB> {
    if (db) return db;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) db = JSON.parse(raw) as DB;
    } catch {
      db = null;
    }
    if (!db) {
      db = buildSeed();
      persist();
    }
    return db;
  }
  function persist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (db) AsyncStorage.setItem(KEY, JSON.stringify(db)).catch(() => {});
    }, 300);
  }
  async function tx<T>(fn: (d: DB) => T): Promise<T> {
    const d = await load();
    await wait();
    const out = fn(d);
    persist();
    return out;
  }
  const me = (d: DB) => {
    if (!d.sessionUserId) throw new Error('Not signed in');
    return d.sessionUserId;
  };
  const session = (d: DB): Session | null =>
    d.sessionUserId ? { userId: d.sessionUserId, email: d.users[d.sessionUserId]?.email ?? null } : null;
  const emitAuth = (d: DB) => authListeners.forEach((cb) => cb(session(d)));

  const isFollowing = (d: DB, viewer: string, target: string) =>
    d.follows.some((f) => f.follower_id === viewer && f.following_id === target && f.status === 'accepted');
  const canView = (d: DB, viewer: string, owner: string, vis: Visibility) => {
    if (viewer === owner) return true;
    const pv = d.users[owner]?.profile.visibility;
    if (vis === 'private' || pv === 'private') return false;
    if (vis === 'public' && pv === 'public') return true;
    return isFollowing(d, viewer, owner);
  };
  const decorate = (d: DB, a: Activity, viewer: string): Activity => ({
    ...a,
    profile: pickActor(d, a.user_id) ?? undefined,
    liked_by_me: d.likes.some((l) => l.activity_id === a.id && l.user_id === viewer),
  });
  const visible = (d: DB, viewer: string) => d.activities.filter((a) => canView(d, viewer, a.user_id, a.visibility));
  const page = (list: Activity[], cursor: string | null) => {
    const items = (cursor ? list.filter((a) => a.started_at < cursor) : list).slice(0, PAGE);
    return { items, nextCursor: items.length === PAGE ? items[items.length - 1].started_at : null };
  };

  function notify(d: DB, recipient: string, actor: string | null, type: NotificationType, extra: Partial<AppNotification> = {}) {
    if (recipient === actor) return;
    const p = d.prefs[recipient] ?? DEFAULT_PREFS_LOCAL;
    const allowed: Record<NotificationType, boolean> = {
      follow_request: p.follow_requests, new_follower: p.new_followers, like: p.likes, comment: p.comments,
      challenge_invite: p.challenges, challenge_complete: p.challenges, personal_record: p.records,
      achievement: p.records, streak: p.streaks,
    };
    if (!allowed[type]) return;
    d.notifications.unshift({
      id: uuid(), user_id: recipient, type, actor: actor ? pickActor(d, actor) : null, activity_id: null,
      challenge_id: null, data: {}, read_at: null, created_at: new Date().toISOString(), ...extra,
    });
    if (recipient === d.sessionUserId) setTimeout(() => notifListeners.forEach((cb) => cb()), 50);
  }

  function challengeProgress(d: DB, c: Challenge, user: string): number {
    const acts = d.activities.filter(
      (a) => a.user_id === user && a.started_at >= c.starts_at && a.started_at <= c.ends_at &&
        (c.activity_types.length === 0 || c.activity_types.includes(a.type)),
    );
    switch (c.metric) {
      case 'distance': return Math.round(acts.reduce((s, a) => s + a.distance_m, 0) / 100) / 10;
      case 'calories': return acts.reduce((s, a) => s + a.calories, 0);
      case 'duration': return Math.round(acts.reduce((s, a) => s + a.moving_time_s, 0) / 60);
      case 'count': return acts.length;
      case 'active_days': return new Set(acts.map((a) => dayKey(a.started_at))).size;
    }
  }

  function award(d: DB, user: string, code: string, activityId: string | null) {
    const a = d.achievements.find((x) => x.code === code);
    if (!a || d.userAchievements.some((u) => u.user_id === user && u.achievement_id === a.id)) return;
    d.userAchievements.push({ user_id: user, achievement_id: a.id, earned_at: new Date().toISOString() });
    notify(d, user, null, 'achievement', { activity_id: activityId, data: { title: a.title, icon: a.icon } });
  }

  function refreshProgress(d: DB, user: string, activityId: string | null) {
    for (const p of d.participants.filter((x) => x.user_id === user)) {
      const c = d.challenges.find((x) => x.id === p.challenge_id);
      if (!c) continue;
      const done = challengeProgress(d, c, user) >= c.target_value;
      if (done && !p.completed_at) {
        p.completed_at = new Date().toISOString();
        notify(d, user, null, 'challenge_complete', { challenge_id: c.id, activity_id: activityId, data: { title: c.title } });
        const code = { 'weekly-10k': 'chal_10k', 'monthly-100k': 'chal_100k', '30-day-active': 'chal_30day', 'calorie-5000': 'chal_calorie' }[c.slug];
        if (code) award(d, user, code, activityId);
      } else if (!done) p.completed_at = null;
    }
    const mine = d.activities.filter((a) => a.user_id === user);
    if (mine.length >= 1) award(d, user, 'first_activity', activityId);
    if (mine.length >= 50) award(d, user, 'fifty_activities', activityId);
    if (mine.reduce((s, a) => s + a.distance_m, 0) >= 100000) award(d, user, 'distance_100k', activityId);
    const streak = currentStreak(mine);
    if (streak >= 7) award(d, user, 'streak_7', activityId);
    if (streak >= 30) award(d, user, 'streak_30', activityId);
    if ([3, 7, 14, 30, 60, 100].includes(streak)) notify(d, user, null, 'streak', { activity_id: activityId, data: { days: streak } });
  }

  const backend: Backend = {
    mode: 'demo',

    async getSession() {
      return session(await load());
    },
    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },
    async signUp(email, password, fullName) {
      await tx((d) => {
        const e = email.trim().toLowerCase();
        if (Object.values(d.users).some((u) => u.email === e)) throw new Error('An account with this email already exists');
        const id = `u_${uuid().slice(0, 8)}`;
        const base = e.split('@')[0].replace(/[^a-z0-9_.]/g, '').slice(0, 16) || 'athlete';
        d.users[id] = {
          email: e, password,
          profile: { id, username: `${base}_${id.slice(2, 6)}`, full_name: fullName || null, bio: null, avatar_url: null, location_label: null, visibility: 'public', show_in_leaderboards: true, onboarded: false, created_at: new Date().toISOString() },
          private: blankPrivate(id),
        };
        d.prefs[id] = { ...DEFAULT_PREFS_LOCAL };
        d.weights[id] = [];
        for (const c of d.challenges.slice(0, 2)) d.participants.push({ challenge_id: c.id, user_id: id, joined_at: new Date().toISOString(), completed_at: null });
        d.sessionUserId = id;
      });
      emitAuth(db!);
      return { needsConfirmation: false };
    },
    async signIn(email, password) {
      await tx((d) => {
        const e = email.trim().toLowerCase();
        const u = Object.values(d.users).find((x) => x.email === e);
        // Demo only: credentials live on this device. Production auth is Supabase Auth.
        if (!u || !u.password || u.password !== password) throw new Error('Invalid email or password');
        d.sessionUserId = u.profile.id;
      });
      emitAuth(db!);
    },
    async signInWithGoogle() {
      await tx((d) => { d.sessionUserId = ME; });
      emitAuth(db!);
    },
    async resetPassword(email) {
      await tx((d) => {
        if (!Object.values(d.users).some((u) => u.email === email.trim().toLowerCase())) return;
      });
    },
    async signOut() {
      await tx((d) => { d.sessionUserId = null; });
      emitAuth(db!);
    },
    async deleteAccount() {
      await tx((d) => {
        const id = me(d);
        const actIds = new Set(d.activities.filter((a) => a.user_id === id).map((a) => a.id));
        d.activities = d.activities.filter((a) => a.user_id !== id);
        actIds.forEach((a) => delete d.points[a]);
        d.likes = d.likes.filter((l) => l.user_id !== id && !actIds.has(l.activity_id));
        d.comments = d.comments.filter((c) => c.user_id !== id && !actIds.has(c.activity_id));
        d.follows = d.follows.filter((f) => f.follower_id !== id && f.following_id !== id);
        d.participants = d.participants.filter((p) => p.user_id !== id);
        d.userAchievements = d.userAchievements.filter((u) => u.user_id !== id);
        d.goals = d.goals.filter((g) => g.user_id !== id);
        d.notifications = d.notifications.filter((n) => n.user_id !== id && n.actor?.id !== id);
        delete d.weights[id];
        delete d.prefs[id];
        delete d.users[id];
        d.sessionUserId = null;
        recount(d);
        if (id === ME) {
          // Deleting the demo account resets the sample data for the next visitor.
          db = buildSeed();
        }
      });
      emitAuth(db!);
    },

    async getMe(): Promise<Me> {
      const d = await load();
      const u = d.users[me(d)];
      return { profile: { ...u.profile }, private: { ...u.private }, email: u.email };
    },
    async updateProfile(patch) {
      await tx((d) => {
        const u = d.users[me(d)];
        if (patch.username && Object.values(d.users).some((x) => x.profile.username === patch.username && x.profile.id !== u.profile.id)) {
          throw new Error('That username is taken');
        }
        u.profile = { ...u.profile, ...patch };
      });
    },
    async updatePrivate(patch) {
      await tx((d) => {
        const u = d.users[me(d)];
        u.private = { ...u.private, ...patch };
      });
    },
    async uploadAvatar(uri) {
      await backend.updateProfile({ avatar_url: uri });
      return uri;
    },
    async getProfile(id) {
      const d = await load();
      return d.users[id]?.profile ?? null;
    },
    async searchPeople(q) {
      const d = await load();
      const t = q.trim().toLowerCase();
      if (!t) return [];
      return Object.values(d.users).map((u) => u.profile)
        .filter((p) => p.username.includes(t) || (p.full_name ?? '').toLowerCase().includes(t)).slice(0, 20);
    },
    async suggestedPeople() {
      const d = await load();
      const id = me(d);
      return Object.values(d.users).map((u) => u.profile)
        .filter((p) => p.id !== id && p.visibility !== 'private' && !d.follows.some((f) => f.follower_id === id && f.following_id === p.id));
    },
    async followStats(userId) {
      const d = await load();
      const id = me(d);
      const rel = d.follows.find((f) => f.follower_id === id && f.following_id === userId);
      return {
        followers: d.follows.filter((f) => f.following_id === userId && f.status === 'accepted').length,
        following: d.follows.filter((f) => f.follower_id === userId && f.status === 'accepted').length,
        status: userId === id ? 'self' : !rel ? 'none' : rel.status === 'pending' ? 'pending' : 'following',
      };
    },
    async follow(userId) {
      await tx((d) => {
        const id = me(d);
        if (d.follows.some((f) => f.follower_id === id && f.following_id === userId)) return;
        const status = d.users[userId]?.profile.visibility === 'public' ? 'accepted' : 'pending';
        d.follows.push({ follower_id: id, following_id: userId, status });
        notify(d, userId, id, status === 'pending' ? 'follow_request' : 'new_follower');
      });
    },
    async unfollow(userId) {
      await tx((d) => {
        const id = me(d);
        d.follows = d.follows.filter((f) => !(f.follower_id === id && f.following_id === userId));
      });
    },
    async acceptFollow(userId) {
      await tx((d) => {
        const id = me(d);
        const f = d.follows.find((x) => x.follower_id === userId && x.following_id === id);
        if (f) f.status = 'accepted';
        d.notifications = d.notifications.filter((n) => !(n.user_id === id && n.type === 'follow_request' && n.actor?.id === userId));
        notify(d, userId, id, 'new_follower', { data: { accepted: true } });
      });
    },
    async declineFollow(userId) {
      await tx((d) => {
        const id = me(d);
        d.follows = d.follows.filter((x) => !(x.follower_id === userId && x.following_id === id));
        d.notifications = d.notifications.filter((n) => !(n.user_id === id && n.type === 'follow_request' && n.actor?.id === userId));
      });
    },

    async feed(cursor) {
      const d = await load();
      const id = me(d);
      const list = visible(d, id).filter((a) => a.user_id === id || isFollowing(d, id, a.user_id));
      const p = page(list, cursor);
      return { ...p, items: p.items.map((a) => decorate(d, a, id)) };
    },
    async myActivities() {
      const d = await load();
      const id = me(d);
      return d.activities.filter((a) => a.user_id === id).map((a) => decorate(d, a, id));
    },
    async userActivities(userId, cursor) {
      const d = await load();
      const id = me(d);
      const p = page(visible(d, id).filter((a) => a.user_id === userId), cursor);
      return { ...p, items: p.items.map((a) => decorate(d, a, id)) };
    },
    async getActivity(aid) {
      const d = await load();
      const id = me(d);
      const a = d.activities.find((x) => x.id === aid);
      return a && canView(d, id, a.user_id, a.visibility) ? decorate(d, a, id) : null;
    },
    async getActivityPoints(aid) {
      const d = await load();
      const a = d.activities.find((x) => x.id === aid);
      return a && a.user_id === me(d) ? d.points[aid] ?? [] : [];
    },
    async saveActivity(draft, mapPolyline, region) {
      return tx((d) => {
        const id = me(d);
        const existing = d.activities.find((a) => a.client_id === draft.client_id);
        if (existing) return decorate(d, existing, id);
        const prev = d.activities.filter((a) => a.user_id === id);
        const before = computeRecords(prev);
        const a: Activity = {
          id: uuid(), client_id: draft.client_id, user_id: id, type: draft.type, title: draft.title,
          description: draft.description ?? null, visibility: draft.visibility, started_at: draft.started_at,
          ended_at: draft.ended_at, moving_time_s: draft.moving_time_s, elapsed_time_s: draft.elapsed_time_s,
          distance_m: draft.distance_m, elevation_gain_m: draft.elevation_gain_m, avg_speed_mps: draft.avg_speed_mps,
          max_speed_mps: draft.max_speed_mps, avg_pace_s_km: draft.avg_pace_s_km, calories: draft.calories,
          steps: draft.steps, avg_hr: draft.avg_hr, max_hr: draft.max_hr, map_polyline: mapPolyline, ...region,
          like_count: 0, comment_count: 0, created_at: new Date().toISOString(), photos: draft.photo_uris,
          splits: draft.splits, best_efforts: draft.best_efforts, sets: draft.sets,
        };
        d.activities.unshift(a);
        d.activities.sort((x, y) => y.started_at.localeCompare(x.started_at));
        if (draft.points.length) d.points[a.id] = draft.points;
        const after = computeRecords([...prev, a]);
        const prevMap = new Map(before.map((r) => [r.record, r.value]));
        for (const r of after) {
          if (r.activity_id === a.id && prevMap.has(r.record) && prevMap.get(r.record) !== r.value) {
            notify(d, id, null, 'personal_record', { activity_id: a.id, data: { record: r.record, label: RECORD_META[r.record].label } });
          }
        }
        refreshProgress(d, id, a.id);
        return decorate(d, a, id);
      });
    },
    async updateActivity(aid, patch) {
      await tx((d) => {
        const a = d.activities.find((x) => x.id === aid && x.user_id === me(d));
        if (a) Object.assign(a, patch);
      });
    },
    async deleteActivity(aid) {
      await tx((d) => {
        const id = me(d);
        d.activities = d.activities.filter((a) => !(a.id === aid && a.user_id === id));
        delete d.points[aid];
        d.likes = d.likes.filter((l) => l.activity_id !== aid);
        d.comments = d.comments.filter((c) => c.activity_id !== aid);
        refreshProgress(d, id, null);
      });
    },
    async addActivityPhotos(aid, uris) {
      await tx((d) => {
        const a = d.activities.find((x) => x.id === aid && x.user_id === me(d));
        if (a) a.photos = [...(a.photos ?? []), ...uris].slice(0, 6);
      });
    },
    async nearbyActivities(type) {
      const d = await load();
      const id = me(d);
      return d.activities
        .filter((a) => a.user_id !== id && a.visibility === 'public' && d.users[a.user_id]?.profile.visibility === 'public' && a.map_polyline && (!type || a.type === type))
        .slice(0, 20).map((a) => decorate(d, a, id));
    },
    async searchActivities(q) {
      const d = await load();
      const id = me(d);
      const t = q.trim().toLowerCase();
      if (!t) return [];
      return visible(d, id).filter((a) => a.title.toLowerCase().includes(t)).slice(0, 20).map((a) => decorate(d, a, id));
    },

    async setLike(aid, liked) {
      await tx((d) => {
        const id = me(d);
        const has = d.likes.some((l) => l.activity_id === aid && l.user_id === id);
        const a = d.activities.find((x) => x.id === aid);
        if (!a || !canView(d, id, a.user_id, a.visibility)) throw new Error('Activity not found');
        if (liked && !has) {
          d.likes.push({ activity_id: aid, user_id: id });
          a.like_count++;
          notify(d, a.user_id, id, 'like', { activity_id: aid });
        } else if (!liked && has) {
          d.likes = d.likes.filter((l) => !(l.activity_id === aid && l.user_id === id));
          a.like_count = Math.max(0, a.like_count - 1);
        }
      });
    },
    async comments(aid) {
      const d = await load();
      return d.comments.filter((c) => c.activity_id === aid)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => ({ ...c, profile: pickActor(d, c.user_id) ?? undefined }));
    },
    async addComment(aid, body) {
      return tx((d) => {
        const id = me(d);
        const a = d.activities.find((x) => x.id === aid);
        if (!a || !canView(d, id, a.user_id, a.visibility)) throw new Error('Activity not found');
        const recent = d.comments.filter((c) => c.user_id === id && Date.now() - new Date(c.created_at).getTime() < 60000);
        if (recent.length >= 10) throw new Error('Rate limit exceeded, please slow down');
        const c: Comment = { id: uuid(), activity_id: aid, user_id: id, body, created_at: new Date().toISOString() };
        d.comments.push(c);
        a.comment_count++;
        notify(d, a.user_id, id, 'comment', { activity_id: aid, data: { preview: body.slice(0, 80) } });
        return { ...c, profile: pickActor(d, id) ?? undefined };
      });
    },
    async deleteComment(cid) {
      await tx((d) => {
        const id = me(d);
        const c = d.comments.find((x) => x.id === cid);
        if (!c) return;
        const a = d.activities.find((x) => x.id === c.activity_id);
        if (c.user_id !== id && a?.user_id !== id) throw new Error('Not allowed');
        d.comments = d.comments.filter((x) => x.id !== cid);
        if (a) a.comment_count = Math.max(0, a.comment_count - 1);
      });
    },

    async challenges() {
      const d = await load();
      const id = me(d);
      return d.challenges.map((c) => {
        const p = d.participants.find((x) => x.challenge_id === c.id && x.user_id === id);
        return {
          ...c,
          participant_count: d.participants.filter((x) => x.challenge_id === c.id).length,
          my_progress: p ? challengeProgress(d, c, id) : null,
          my_completed_at: p?.completed_at ?? null,
        };
      });
    },
    async challenge(cid) {
      return (await backend.challenges()).find((c) => c.id === cid) ?? null;
    },
    async challengeLeaderboard(cid) {
      const d = await load();
      const id = me(d);
      const c = d.challenges.find((x) => x.id === cid);
      if (!c) return [];
      const rows = d.participants
        .filter((p) => p.challenge_id === cid)
        .filter((p) => p.user_id === id || (d.users[p.user_id]?.profile.show_in_leaderboards && d.users[p.user_id]?.profile.visibility !== 'private'))
        .map((p) => {
          const pr = d.users[p.user_id].profile;
          const value = challengeProgress(d, c, p.user_id);
          return { user_id: pr.id, username: pr.username, full_name: pr.full_name, avatar_url: pr.avatar_url, value, rank: 0, completed: value >= c.target_value };
        })
        .sort((a, b) => b.value - a.value);
      return rank(rows);
    },
    async joinChallenge(cid) {
      await tx((d) => {
        const id = me(d);
        if (!d.participants.some((p) => p.challenge_id === cid && p.user_id === id)) {
          d.participants.push({ challenge_id: cid, user_id: id, joined_at: new Date().toISOString(), completed_at: null });
          refreshProgress(d, id, null);
        }
      });
    },
    async leaveChallenge(cid) {
      await tx((d) => {
        const id = me(d);
        d.participants = d.participants.filter((p) => !(p.challenge_id === cid && p.user_id === id));
      });
    },
    async achievements(userId) {
      const d = await load();
      return d.achievements.map((a) => ({
        ...a,
        earned_at: d.userAchievements.find((u) => u.user_id === userId && u.achievement_id === a.id)?.earned_at ?? null,
      }));
    },
    async leaderboard(metric, since, scope) {
      const d = await load();
      const id = me(d);
      const s = since.toISOString();
      const eligible = Object.values(d.users).map((u) => u.profile).filter((p) =>
        p.id === id || (p.show_in_leaderboards && p.visibility !== 'private' &&
          (scope !== 'friends' || isFollowing(d, id, p.id)) && (p.visibility === 'public' || isFollowing(d, id, p.id))));
      const rows = eligible.map((p) => {
        const acts = d.activities.filter((a) => a.user_id === p.id && a.started_at >= s && (a.visibility !== 'private' || p.id === id));
        const value =
          metric === 'distance' ? acts.reduce((t, a) => t + a.distance_m, 0) / 1000
          : metric === 'calories' ? acts.reduce((t, a) => t + a.calories, 0)
          : metric === 'duration' ? acts.reduce((t, a) => t + a.moving_time_s, 0) / 3600
          : acts.length;
        return { user_id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url, value: Math.round(value * 10) / 10, rank: 0 };
      }).filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
      return rank(rows);
    },

    async goals() {
      const d = await load();
      const id = me(d);
      return d.goals.filter((g) => g.user_id === id && g.status !== 'archived');
    },
    async createGoal(g) {
      return tx((d) => {
        const goal = { ...g, id: uuid(), user_id: me(d), status: g.status ?? 'active', created_at: new Date().toISOString() } as const;
        d.goals.push(goal);
        return goal;
      });
    },
    async updateGoal(gid, patch) {
      await tx((d) => {
        const g = d.goals.find((x) => x.id === gid && x.user_id === me(d));
        if (g) Object.assign(g, patch);
      });
    },
    async deleteGoal(gid) {
      await tx((d) => {
        const id = me(d);
        d.goals = d.goals.filter((g) => !(g.id === gid && g.user_id === id));
      });
    },
    async weightLogs() {
      const d = await load();
      return [...(d.weights[me(d)] ?? [])].sort((a, b) => a.logged_on.localeCompare(b.logged_on));
    },
    async addWeight(kg, date, note) {
      await tx((d) => {
        const id = me(d);
        const logs = (d.weights[id] ??= []);
        const existing = logs.find((l) => l.logged_on === date);
        if (existing) { existing.weight_kg = kg; existing.note = note ?? null; }
        else logs.push({ id: uuid(), weight_kg: kg, logged_on: date, note: note ?? null });
        const latest = [...logs].sort((a, b) => b.logged_on.localeCompare(a.logged_on))[0];
        d.users[id].private.weight_kg = latest.weight_kg;
      });
    },
    async deleteWeight(wid) {
      await tx((d) => {
        const id = me(d);
        d.weights[id] = (d.weights[id] ?? []).filter((w) => w.id !== wid);
      });
    },

    async notifications() {
      const d = await load();
      const id = me(d);
      return d.notifications.filter((n) => n.user_id === id).slice(0, 50);
    },
    async markRead(nid) {
      await tx((d) => {
        const id = me(d);
        const now = new Date().toISOString();
        d.notifications.forEach((n) => { if (n.user_id === id && !n.read_at && (!nid || n.id === nid)) n.read_at = now; });
      });
    },
    async notificationPrefs() {
      const d = await load();
      return { ...DEFAULT_PREFS_LOCAL, ...d.prefs[me(d)] };
    },
    async updateNotificationPrefs(p) {
      await tx((d) => { d.prefs[me(d)] = { ...DEFAULT_PREFS_LOCAL, ...d.prefs[me(d)], ...p }; });
    },
    subscribeNotifications(cb) {
      notifListeners.add(cb);
      return () => notifListeners.delete(cb);
    },

    async exercises() {
      const d = await load();
      const id = me(d);
      return d.exercises.filter((e) => !e.created_by || e.created_by === id)
        .map(({ created_by, ...e }) => ({ ...e, is_custom: !!created_by }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async createExercise(name, category, muscle) {
      return tx((d) => {
        const id = me(d);
        if (d.exercises.some((e) => e.name.toLowerCase() === name.toLowerCase() && (!e.created_by || e.created_by === id))) {
          throw new Error('An exercise with that name already exists');
        }
        const e = { id: uuid(), name, category, muscle_group: muscle, is_custom: true, created_by: id };
        d.exercises.push(e);
        const { created_by: _c, ...rest } = e;
        return rest as Exercise;
      });
    },
    async routes(type, q) {
      const d = await load();
      const t = q?.trim().toLowerCase();
      return d.routes.filter((r) => (!type || r.type === type) && (!t || r.name.toLowerCase().includes(t)))
        .sort((a, b) => b.times_completed - a.times_completed);
    },
  };
  return backend;
}

function rank(rows: LeaderRow[]): LeaderRow[] {
  let last = NaN;
  let r = 0;
  return rows.map((row, i) => {
    if (row.value !== last) { r = i + 1; last = row.value; }
    return { ...row, rank: r };
  });
}

