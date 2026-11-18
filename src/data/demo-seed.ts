// Deterministic sample data for demo mode.
import { estimateCalories, estimateSteps } from '@/lib/calories';
import { autoTitle, dayKey } from '@/lib/format';
import { bestEfforts, computeSplits, elevationGain, encodePolyline, totalDistance } from '@/lib/geo';
import type {
  Achievement, Activity, ActivityType, AppNotification, Challenge, Comment, Exercise, GeoPoint,
  Goal, NotificationPrefs, Profile, ProfilePrivate, Route, WeightLog, WorkoutSet,
} from '@/lib/types';

export const DEMO_EMAIL = 'demo@skyro.app';
export const DEMO_PASSWORD = 'skyro2026';
export const ME = 'u_me';
const CENTER = { lat: 12.9716, lng: 77.5946 };
const DAY = 86400000;

export interface DemoUser {
  profile: Profile;
  private: ProfilePrivate;
  email: string;
  password: string;
}

export interface DB {
  version: number;
  sessionUserId: string | null;
  users: Record<string, DemoUser>;
  follows: { follower_id: string; following_id: string; status: 'pending' | 'accepted' }[];
  activities: Activity[];
  points: Record<string, GeoPoint[]>;
  likes: { activity_id: string; user_id: string }[];
  comments: Comment[];
  challenges: Challenge[];
  participants: { challenge_id: string; user_id: string; joined_at: string; completed_at: string | null }[];
  achievements: Achievement[];
  userAchievements: { user_id: string; achievement_id: string; earned_at: string }[];
  goals: Goal[];
  weights: Record<string, WeightLog[]>;
  notifications: (AppNotification & { user_id: string })[];
  prefs: Record<string, NotificationPrefs>;
  exercises: (Exercise & { created_by: string | null })[];
  routes: Route[];
}

// Mulberry32 PRNG — deterministic seed data.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a plausible looped GPS track. */
export function generateTrack(
  rand: () => number, startMs: number, distanceM: number, speedMps: number,
  center = CENTER, stepS = 6,
): GeoPoint[] {
  const radius = distanceM / (2 * Math.PI);
  const phase = rand() * Math.PI * 2;
  const wobble = 0.12 + rand() * 0.15;
  const lobes = 2 + Math.floor(rand() * 3);
  const off = { lat: (rand() - 0.5) * 0.06, lng: (rand() - 0.5) * 0.06 };
  const totalS = distanceM / speedMps;
  const n = Math.max(20, Math.round(totalS / stepS));
  const pts: GeoPoint[] = [];
  let tAcc = startMs;
  for (let i = 0; i <= n; i++) {
    if (i > 0) tAcc += (totalS / n) * 1000 * (0.9 + rand() * 0.2); // monotonic, with pace variation
    const th = phase + (i / n) * Math.PI * 2;
    const r = radius * (1 + wobble * Math.sin(lobes * th + phase));
    const dLat = (r * Math.sin(th)) / 111320;
    const dLng = (r * Math.cos(th)) / (111320 * Math.cos((center.lat * Math.PI) / 180));
    const jitter = () => (rand() - 0.5) * 0.00004;
    pts.push({
      lat: center.lat + off.lat + dLat - (radius * Math.sin(phase)) / 111320 + jitter(),
      lng: center.lng + off.lng + dLng + jitter(),
      alt: 905 + 18 * Math.sin(th * 2 + phase) + 6 * Math.sin(th * 7),
      t: tAcc,
    });
  }
  // Re-time so the actual polyline distance matches the target pace.
  const d = totalDistance(pts);
  const scale = d / speedMps / ((pts[n].t - pts[0].t) / 1000);
  return pts.map((p) => ({ ...p, t: startMs + (p.t - startMs) * scale }));
}

const PEOPLE: [string, string, string, string, Profile['visibility']][] = [
  ['u_aria', 'aria.runs', 'Aria Menon', 'Trail runner · chasing sunrise 10Ks', 'public'],
  ['u_kai', 'kai_rides', 'Kai Fernandes', 'Weekend century rider', 'public'],
  ['u_noor', 'noor.moves', 'Noor Siddiqui', 'Marathon #4 loading…', 'public'],
  ['u_leo', 'leo.lifts', 'Leo Thomas', 'Barbells and long walks', 'followers'],
  ['u_mira', 'mira_k', 'Mira Kapoor', 'Learning to love hills', 'public'],
  ['u_dev', 'dev.pace', 'Dev Rao', 'Coffee → run → coffee', 'public'],
  ['u_sana', 'sana.strides', 'Sana Iyer', '5K PR hunter', 'private'],
];

export const BUILTIN_EXERCISES: [string, Exercise['category'], string][] = [
  ['Bench Press', 'strength', 'Chest'], ['Incline Dumbbell Press', 'strength', 'Chest'], ['Push-up', 'strength', 'Chest'],
  ['Squat', 'strength', 'Legs'], ['Deadlift', 'strength', 'Back'], ['Romanian Deadlift', 'strength', 'Hamstrings'],
  ['Lat Pulldown', 'strength', 'Back'], ['Seated Row', 'strength', 'Back'], ['Pull-up', 'strength', 'Back'],
  ['Shoulder Press', 'strength', 'Shoulders'], ['Lateral Raise', 'strength', 'Shoulders'],
  ['Bicep Curl', 'strength', 'Arms'], ['Hammer Curl', 'strength', 'Arms'], ['Tricep Extension', 'strength', 'Arms'],
  ['Tricep Pushdown', 'strength', 'Arms'], ['Leg Press', 'strength', 'Legs'], ['Leg Curl', 'strength', 'Hamstrings'],
  ['Leg Extension', 'strength', 'Quads'], ['Calf Raise', 'strength', 'Calves'], ['Hip Thrust', 'strength', 'Glutes'],
  ['Plank', 'core', 'Core'], ['Crunch', 'core', 'Core'], ['Hanging Leg Raise', 'core', 'Core'],
  ['Russian Twist', 'core', 'Core'], ['Ab Wheel', 'core', 'Core'],
];

export function blankPrivate(id: string): ProfilePrivate {
  return {
    user_id: id, age: null, gender: null, height_cm: null, weight_kg: null, fitness_goal: null,
    activity_prefs: [], units: 'metric', hide_route_ends: true, route_trim_m: 200,
  };
}

export const DEFAULT_PREFS_LOCAL: NotificationPrefs = {
  follow_requests: true, new_followers: true, likes: true, comments: true, challenges: true, records: true, streaks: true,
};

export function buildSeed(): DB {
  const rand = rng(20261118);
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const db: DB = {
    version: 2, sessionUserId: null, users: {}, follows: [], activities: [], points: {}, likes: [], comments: [],
    challenges: [], participants: [], achievements: [], userAchievements: [], goals: [], weights: {},
    notifications: [], prefs: {}, exercises: [], routes: [],
  };

  db.users[ME] = {
    email: DEMO_EMAIL, password: DEMO_PASSWORD,
    profile: {
      id: ME, username: 'you.skyro', full_name: 'Alex Rivera', bio: 'Down 7 kg and counting. Morning runs, evening lifts.',
      avatar_url: null, location_label: 'Bengaluru, IN', visibility: 'public', show_in_leaderboards: true, onboarded: true,
      created_at: iso(now - 200 * DAY),
    },
    private: {
      ...blankPrivate(ME), age: 31, gender: 'prefer_not', height_cm: 178, weight_kg: 97.6,
      fitness_goal: 'lose_weight', activity_prefs: ['run', 'walk', 'strength'],
    },
  };
  for (const [id, username, name, bio, vis] of PEOPLE) {
    db.users[id] = {
      email: `${username}@example.com`, password: '',
      profile: { id, username, full_name: name, bio, avatar_url: null, location_label: 'Bengaluru, IN', visibility: vis, show_in_leaderboards: vis !== 'private', onboarded: true, created_at: iso(now - 300 * DAY) },
      private: blankPrivate(id),
    };
    db.prefs[id] = { ...DEFAULT_PREFS_LOCAL };
    if (id !== 'u_sana') db.follows.push({ follower_id: ME, following_id: id, status: 'accepted' });
    if (rand() > 0.3) db.follows.push({ follower_id: id, following_id: ME, status: 'accepted' });
  }
  db.follows.push({ follower_id: 'u_sana', following_id: ME, status: 'pending' });
  db.prefs[ME] = { ...DEFAULT_PREFS_LOCAL };

  db.exercises = BUILTIN_EXERCISES.map(([name, category, muscle], i) => ({
    id: `ex_${i}`, name, category, muscle_group: muscle, is_custom: false, created_by: null,
  }));
  const exByName = (n: string) => db.exercises.find((e) => e.name === n)!;

  let actSeq = 0;
  const makeActivity = (user: string, type: ActivityType, startMs: number, distanceM: number, speed: number, weight = 75): Activity => {
    const id = `a_${++actSeq}`;
    const base: Activity = {
      id, user_id: user, type, title: autoTitle(type, iso(startMs)), description: null, visibility: 'public',
      started_at: iso(startMs), ended_at: null, moving_time_s: 0, elapsed_time_s: 0, distance_m: 0,
      elevation_gain_m: 0, avg_speed_mps: null, max_speed_mps: null, avg_pace_s_km: null, calories: 0,
      steps: null, avg_hr: null, max_hr: null, map_polyline: null, region_lat: 12.97, region_lng: 77.59,
      like_count: 0, comment_count: 0, created_at: iso(startMs), splits: [], best_efforts: {}, photos: [],
    };
    if (type === 'strength') {
      const minutes = 45 + Math.round(rand() * 25);
      const plan = rand() > 0.5
        ? ['Bench Press', 'Shoulder Press', 'Tricep Extension', 'Lat Pulldown', 'Plank']
        : ['Squat', 'Deadlift', 'Leg Press', 'Leg Curl', 'Bicep Curl'];
      const progress = 1 + (startMs - (now - 180 * DAY)) / (180 * DAY) * 0.18; // gentle progressive overload
      const sets: WorkoutSet[] = [];
      plan.forEach((name) => {
        const ex = exByName(name);
        const baseKg = ({ 'Bench Press': 60, Squat: 80, Deadlift: 100, 'Shoulder Press': 35, 'Lat Pulldown': 50, 'Leg Press': 140 } as Record<string, number>)[name] ?? 20;
        for (let s = 0; s < 3; s++) {
          sets.push({
            exercise_id: ex.id, exercise_name: name, set_index: sets.length,
            reps: name === 'Plank' ? null : 8 + Math.floor(rand() * 5),
            weight_kg: name === 'Plank' ? null : Math.round((baseKg * progress) / 2.5) * 2.5,
            rest_s: 90, duration_s: name === 'Plank' ? 60 : null,
          });
        }
      });
      return {
        ...base, title: plan[0] === 'Bench Press' ? 'Push Day' : 'Leg Day', moving_time_s: minutes * 60,
        elapsed_time_s: minutes * 60, ended_at: iso(startMs + minutes * 60000),
        calories: estimateCalories('strength', minutes * 60, 0, weight), sets, region_lat: null, region_lng: null,
      };
    }
    const pts = generateTrack(rand, startMs, distanceM, speed);
    const dist = totalDistance(pts);
    const secs = Math.round((pts[pts.length - 1].t - pts[0].t) / 1000);
    return {
      ...base,
      ended_at: iso(pts[pts.length - 1].t),
      moving_time_s: secs, elapsed_time_s: secs + Math.round(rand() * 60), distance_m: Math.round(dist),
      elevation_gain_m: elevationGain(pts), avg_speed_mps: dist / secs, max_speed_mps: (dist / secs) * 1.3,
      avg_pace_s_km: secs / (dist / 1000), calories: estimateCalories(type, secs, dist, weight),
      steps: estimateSteps(type, dist, 175), avg_hr: type === 'run' ? 148 + Math.round(rand() * 14) : null,
      max_hr: type === 'run' ? 172 + Math.round(rand() * 12) : null,
      map_polyline: encodePolyline(pts.filter((_, i) => i % 2 === 0)),
      splits: computeSplits(pts), best_efforts: type === 'run' ? bestEfforts(pts) : {},
    };
  };

  // My history: ~180 days, improving pace, 3–5 sessions a week, plus a live streak.
  for (let d = 180; d >= 0; d--) {
    const day = now - d * DAY;
    const dow = new Date(day).getDay();
    const fitness = 1 - d / 180; // 0 → 1
    const streakZone = d <= 8;
    const roll = rand();
    let type: ActivityType | null = null;
    if (streakZone) type = d % 3 === 0 ? 'strength' : d % 3 === 1 ? 'run' : 'walk';
    else if (dow === 0) type = roll > 0.3 ? 'run' : null;
    else if (dow === 2 || dow === 4) type = roll > 0.25 ? 'run' : 'walk';
    else if (dow === 1 || dow === 5) type = roll > 0.35 ? 'strength' : null;
    else if (dow === 6) type = roll > 0.4 ? 'ride' : 'walk';
    if (!type) continue;
    if (d === 0 && new Date().getHours() < 7) continue;
    const hour = type === 'strength' ? 18 : 6 + Math.floor(rand() * 2);
    const start = new Date(day); start.setHours(hour, Math.floor(rand() * 50), 0, 0);
    if (start.getTime() > now) start.setTime(now - 2 * 3600000);
    const weight = 105 - fitness * 7.4;
    const a =
      type === 'run' ? makeActivity(ME, 'run', start.getTime(), (dow === 0 ? 9000 + fitness * 7000 : 4000 + rand() * 3000), 2.55 + fitness * 0.45 + rand() * 0.1, weight)
      : type === 'walk' ? makeActivity(ME, 'walk', start.getTime(), 2500 + rand() * 3500, 1.35 + rand() * 0.15, weight)
      : type === 'ride' ? makeActivity(ME, 'ride', start.getTime(), 18000 + rand() * 20000, 6.2 + fitness * 1.2, weight)
      : makeActivity(ME, 'strength', start.getTime(), 0, 0, weight);
    if (d === 2) { a.title = 'New 5K PB! 🔥'; a.description = 'Legs felt fresh. Negative split on the lakeside loop.'; }
    db.activities.push(a);
  }

  // Friends: recent activity for the feed & leaderboards.
  const friendStyle: Record<string, [ActivityType, number, number][]> = {
    u_aria: [['run', 10000, 3.3], ['run', 6000, 3.4], ['hike', 12000, 1.4]],
    u_kai: [['ride', 45000, 8.1], ['ride', 30000, 7.6], ['run', 5000, 2.9]],
    u_noor: [['run', 16000, 3.1], ['run', 8000, 3.2], ['walk', 4000, 1.5]],
    u_leo: [['strength', 0, 0], ['walk', 6000, 1.5]],
    u_mira: [['walk', 5000, 1.4], ['run', 4000, 2.5], ['ride', 15000, 5.5]],
    u_dev: [['run', 7000, 2.9], ['run', 5000, 3.0]],
    u_sana: [['run', 5000, 3.6], ['run', 3000, 3.7]],
  };
  for (const [uid, styles] of Object.entries(friendStyle)) {
    for (let d = 40; d >= 0; d--) {
      if (rand() > 0.42) continue;
      const [t, dist, sp] = styles[Math.floor(rand() * styles.length)];
      const start = new Date(now - d * DAY); start.setHours(5 + Math.floor(rand() * 13), Math.floor(rand() * 59), 0, 0);
      if (start.getTime() > now) continue;
      db.activities.push(makeActivity(uid, t, start.getTime(), dist * (0.8 + rand() * 0.4), sp * (0.95 + rand() * 0.1)));
    }
  }
  db.activities.sort((a, b) => b.started_at.localeCompare(a.started_at));

  // Likes & comments
  const people = Object.keys(db.users);
  const lines = ['Strong work! 💪', 'That pace though 🔥', 'Consistency king.', 'See you on the loop tomorrow?', 'Huge! Recovery day next?', 'Love this route.'];
  let cSeq = 0;
  for (const a of db.activities.slice(0, 90)) {
    for (const u of people) if (u !== a.user_id && rand() > 0.55) db.likes.push({ activity_id: a.id, user_id: u });
    if (rand() > 0.6) {
      const u = people.filter((p) => p !== a.user_id)[Math.floor(rand() * (people.length - 1))];
      db.comments.push({ id: `c_${++cSeq}`, activity_id: a.id, user_id: u, body: lines[Math.floor(rand() * lines.length)], created_at: iso(new Date(a.started_at).getTime() + 3 * 3600000) });
    }
  }

  // Weight: 105 kg → ~97.6 kg over 150 days, logged every 2–4 days with daily noise.
  const logs: WeightLog[] = [];
  let w = 105;
  for (let d = 150; d >= 0; d -= 2 + Math.floor(rand() * 3)) {
    w = 105 - (150 - d) * (7.4 / 150) + (rand() - 0.5) * 0.8;
    logs.push({ id: `w_${d}`, weight_kg: Math.round(w * 10) / 10, logged_on: dayKey(now - d * DAY), note: null });
  }
  logs[logs.length - 1].weight_kg = 97.6;
  db.weights[ME] = logs;

  db.goals = [
    { id: 'g_1', user_id: ME, type: 'weight_loss', title: 'Reach 90 kg', target_value: 90, start_value: 105, unit: 'kg', exercise_id: null, deadline: dayKey(now + 120 * DAY), status: 'active', created_at: iso(now - 150 * DAY) },
    { id: 'g_2', user_id: ME, type: 'weekly_workouts', title: '4 workouts a week', target_value: 4, start_value: null, unit: 'workouts', exercise_id: null, deadline: null, status: 'active', created_at: iso(now - 90 * DAY) },
    { id: 'g_3', user_id: ME, type: 'daily_steps', title: '10,000 steps', target_value: 10000, start_value: null, unit: 'steps', exercise_id: null, deadline: null, status: 'active', created_at: iso(now - 60 * DAY) },
    { id: 'g_4', user_id: ME, type: 'run_distance', title: 'Run 80 km this month', target_value: 80, start_value: null, unit: 'km', exercise_id: null, deadline: null, status: 'active', created_at: iso(now - 30 * DAY) },
    { id: 'g_5', user_id: ME, type: 'strength', title: 'Bench 80 kg', target_value: 80, start_value: 60, unit: 'kg', exercise_id: exByName('Bench Press').id, deadline: null, status: 'active', created_at: iso(now - 100 * DAY) },
  ];

  // Achievements
  const ach: [string, string, string, string, Achievement['tier']][] = [
    ['first_activity', 'First Steps', 'Record your first activity.', 'footsteps', 'bronze'],
    ['fifty_activities', 'Half Century', 'Complete 50 activities.', 'medal', 'gold'],
    ['distance_100k', '100K Club', 'Cover 100 km in total.', 'trophy', 'silver'],
    ['streak_7', 'Week Warrior', 'Be active 7 days in a row.', 'flame', 'silver'],
    ['streak_30', 'Unbreakable', 'Be active 30 days in a row.', 'infinite', 'platinum'],
    ['chal_10k', '10K Week', 'Completed the 10K Week challenge.', 'ribbon', 'bronze'],
    ['chal_100k', 'Century Month', 'Completed the 100K Month challenge.', 'trophy', 'gold'],
    ['chal_30day', 'Every Single Day', 'Completed the 30-Day Streak challenge.', 'calendar', 'gold'],
    ['chal_calorie', 'Furnace', 'Completed the Burn 5,000 challenge.', 'flame', 'silver'],
  ];
  db.achievements = ach.map(([code, title, description, icon, tier]) => ({ id: `ach_${code}`, code, title, description, icon, tier }));
  for (const [code, days] of [['first_activity', 180], ['fifty_activities', 60], ['distance_100k', 120], ['streak_7', 2]] as const) {
    db.userAchievements.push({ user_id: ME, achievement_id: `ach_${code}`, earned_at: iso(now - days * DAY) });
  }

  // Challenges (rolling windows)
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime() - 1000;
  const mk = (id: string, slug: string, title: string, description: string, metric: Challenge['metric'], types: ActivityType[], target: number, unit: string, s: number, e: number, accent: string): Challenge =>
    ({ id, slug, title, description, metric, activity_types: types, target_value: target, unit, starts_at: iso(s), ends_at: iso(e), accent });
  db.challenges = [
    mk('ch_10k', 'weekly-10k', '10K Week', 'Run 10 km this week. Any pace counts — every kilometre adds up.', 'distance', ['run'], 10, 'km', weekStart.getTime(), weekStart.getTime() + 7 * DAY - 1000, '#2EE6C5'),
    mk('ch_100k', 'monthly-100k', '100K Month', 'Complete 100 km across runs, rides and walks this month.', 'distance', [], 100, 'km', monthStart.getTime(), monthEnd, '#7C5CFF'),
    mk('ch_30day', '30-day-active', '30-Day Streak', 'Complete at least one activity every day for 30 days.', 'active_days', [], 30, 'days', now - 9 * DAY, now + 21 * DAY, '#FFB547'),
    mk('ch_cal', 'calorie-5000', 'Burn 5,000', 'Burn 5,000 active calories this month.', 'calories', [], 5000, 'kcal', monthStart.getTime(), monthEnd, '#FF5C8A'),
    mk('ch_climb', 'ride-150', 'Fortnight 150', 'Ride 150 km in two weeks. Group rides count!', 'distance', ['ride'], 150, 'km', now - 2 * DAY, now + 12 * DAY, '#4DA3FF'),
  ];
  for (const c of db.challenges) {
    for (const u of people) {
      if (u === ME && c.id === 'ch_climb') continue;
      if (u === ME || rand() > 0.35) db.participants.push({ challenge_id: c.id, user_id: u, joined_at: c.starts_at, completed_at: null });
    }
  }

  // Routes for Explore
  const routeDefs: [string, ActivityType, number, number, string][] = [
    ['Lakeside Loop', 'run', 5200, 2.9, 'Ulsoor'], ['Sunrise Tempo', 'run', 10000, 3.1, 'Cubbon Park'],
    ['Ridge Climb', 'ride', 32400, 6.5, 'Nandi Hills'], ['Café Circuit', 'ride', 21000, 7, 'Indiranagar'],
    ['Park Stroll', 'walk', 2800, 1.4, 'Lalbagh'], ['Garden Wander', 'walk', 4100, 1.4, 'Cubbon Park'],
    ['Boulder Trail', 'hike', 8600, 1.2, 'Turahalli'],
  ];
  db.routes = routeDefs.map(([name, type, dist, sp, label], i) => {
    const pts = generateTrack(rand, now, dist, sp);
    return { id: `r_${i}`, name, type, distance_m: Math.round(totalDistance(pts)), elevation_gain_m: elevationGain(pts), map_polyline: encodePolyline(pts.filter((_, j) => j % 2 === 0)), region_label: label, times_completed: Math.round(300 + rand() * 2500) };
  });

  // Notifications
  const myLatest = db.activities.find((a) => a.user_id === ME && a.type === 'run');
  const n = (id: string, type: AppNotification['type'], actor: string | null, hoursAgo: number, extra: Partial<AppNotification> = {}) =>
    db.notifications.push({ id, user_id: ME, type, actor: actor ? pickActor(db, actor) : null, activity_id: null, challenge_id: null, data: {}, read_at: hoursAgo > 30 ? iso(now) : null, created_at: iso(now - hoursAgo * 3600000), ...extra });
  n('n_1', 'like', 'u_aria', 1, { activity_id: myLatest?.id ?? null });
  n('n_2', 'comment', 'u_noor', 3, { activity_id: myLatest?.id ?? null, data: { preview: 'That pace though 🔥' } });
  n('n_3', 'follow_request', 'u_sana', 5);
  n('n_4', 'personal_record', null, 48, { activity_id: myLatest?.id ?? null, data: { record: 'fastest_5k' } });
  n('n_5', 'streak', null, 20, { data: { days: 7 } });
  n('n_6', 'challenge_invite', 'u_kai', 26, { challenge_id: 'ch_climb', data: { title: 'Fortnight 150' } });
  n('n_7', 'new_follower', 'u_dev', 60);
  n('n_8', 'achievement', null, 50, { data: { title: 'Week Warrior', icon: 'flame' } });

  recount(db);
  return db;
}

export function pickActor(db: DB, id: string) {
  const p = db.users[id]?.profile;
  return p ? { id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url } : null;
}

export function recount(db: DB) {
  const likes = new Map<string, number>();
  const comments = new Map<string, number>();
  db.likes.forEach((l) => likes.set(l.activity_id, (likes.get(l.activity_id) ?? 0) + 1));
  db.comments.forEach((c) => comments.set(c.activity_id, (comments.get(c.activity_id) ?? 0) + 1));
  db.activities.forEach((a) => { a.like_count = likes.get(a.id) ?? 0; a.comment_count = comments.get(a.id) ?? 0; });
}
