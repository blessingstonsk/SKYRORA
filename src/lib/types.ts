// Domain types shared by the UI and both backends (Supabase and local demo).

export type ActivityType = 'run' | 'walk' | 'ride' | 'hike' | 'strength' | 'yoga' | 'swim' | 'other';
export type Visibility = 'public' | 'followers' | 'private';
export type Gender = 'female' | 'male' | 'non_binary' | 'prefer_not';
export type FitnessGoal = 'lose_weight' | 'build_strength' | 'endurance' | 'stay_active' | 'gain_weight';

export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  location_label: string | null;
  visibility: Visibility;
  show_in_leaderboards: boolean;
  onboarded: boolean;
  created_at: string;
}

/** Owner-only body metrics & preferences. Never shown to other users. */
export interface ProfilePrivate {
  user_id: string;
  age: number | null;
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;
  fitness_goal: FitnessGoal | null;
  activity_prefs: ActivityType[];
  units: 'metric' | 'imperial';
  hide_route_ends: boolean;
  route_trim_m: number;
}

export interface Me {
  profile: Profile;
  private: ProfilePrivate;
  email: string | null;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  alt?: number | null;
  t: number; // epoch ms
  speed?: number | null;
  accuracy?: number | null;
  hr?: number | null;
}

export interface Split {
  km: number;
  seconds: number;
  elevation: number;
}

export interface WorkoutSet {
  exercise_id: string;
  exercise_name: string;
  set_index: number;
  reps: number | null;
  weight_kg: number | null;
  rest_s: number | null;
  duration_s: number | null;
}

export interface Activity {
  id: string;
  client_id?: string | null;
  user_id: string;
  type: ActivityType;
  title: string;
  description: string | null;
  visibility: Visibility;
  started_at: string;
  ended_at: string | null;
  moving_time_s: number;
  elapsed_time_s: number;
  distance_m: number;
  elevation_gain_m: number;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_pace_s_km: number | null;
  calories: number;
  steps: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  map_polyline: string | null;
  region_lat: number | null;
  region_lng: number | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  // Joined / derived
  profile?: Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url'>;
  photos?: string[];
  liked_by_me?: boolean;
  splits?: Split[];
  best_efforts?: Record<string, number>;
  sets?: WorkoutSet[];
}

/** What the recorder / manual logger produces before it is saved. */
export interface ActivityDraft {
  client_id: string;
  type: ActivityType;
  title: string;
  description?: string | null;
  visibility: Visibility;
  started_at: string;
  ended_at: string;
  moving_time_s: number;
  elapsed_time_s: number;
  distance_m: number;
  elevation_gain_m: number;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_pace_s_km: number | null;
  calories: number;
  steps: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  points: GeoPoint[];
  splits: Split[];
  best_efforts: Record<string, number>;
  photo_uris: string[];
  sets?: WorkoutSet[];
}

export interface Comment {
  id: string;
  activity_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile?: Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url'>;
}

export type ChallengeMetric = 'distance' | 'active_days' | 'calories' | 'duration' | 'count';

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  description: string;
  metric: ChallengeMetric;
  activity_types: ActivityType[];
  target_value: number;
  unit: string;
  starts_at: string;
  ends_at: string;
  accent: string;
  participant_count?: number;
  my_progress?: number | null; // null = not joined
  my_completed_at?: string | null;
}

export interface LeaderRow {
  user_id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  value: number;
  rank: number;
  completed?: boolean;
}

export interface Achievement {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  earned_at?: string | null;
}

export type RecordKey =
  | 'fastest_1k' | 'fastest_5k' | 'fastest_10k' | 'longest_run' | 'longest_ride'
  | 'longest_walk' | 'most_calories' | 'most_active_week' | 'longest_streak';

export interface PersonalRecord {
  record: RecordKey;
  value: number;
  activity_id: string | null;
  achieved_at: string;
}

export type GoalType =
  | 'weight_loss' | 'weight_gain' | 'run_distance' | 'weekly_workouts'
  | 'daily_steps' | 'calories' | 'strength';

export interface Goal {
  id: string;
  user_id: string;
  type: GoalType;
  title: string;
  target_value: number;
  start_value: number | null;
  unit: string;
  exercise_id: string | null;
  deadline: string | null;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
}

export interface WeightLog {
  id: string;
  weight_kg: number;
  logged_on: string; // YYYY-MM-DD
  note: string | null;
}

export type NotificationType =
  | 'follow_request' | 'new_follower' | 'like' | 'comment' | 'challenge_invite'
  | 'challenge_complete' | 'personal_record' | 'streak' | 'achievement';

export interface AppNotification {
  id: string;
  type: NotificationType;
  actor?: Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url'> | null;
  activity_id: string | null;
  challenge_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPrefs {
  follow_requests: boolean;
  new_followers: boolean;
  likes: boolean;
  comments: boolean;
  challenges: boolean;
  records: boolean;
  streaks: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  category: 'strength' | 'core' | 'cardio' | 'mobility';
  muscle_group: string | null;
  is_custom: boolean;
}

export interface Route {
  id: string;
  name: string;
  type: ActivityType;
  distance_m: number;
  elevation_gain_m: number;
  map_polyline: string;
  region_label: string | null;
  times_completed: number;
}

export interface FollowStats {
  followers: number;
  following: number;
  /** relationship from the viewer's perspective */
  status: 'self' | 'none' | 'pending' | 'following';
}

export type LeaderMetric = 'distance' | 'calories' | 'count' | 'duration';
export type LeaderScope = 'friends' | 'local' | 'global';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
