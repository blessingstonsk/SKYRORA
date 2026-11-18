// The single data-access contract used by the app. Two implementations:
//  - supabase.ts: production (Postgres + RLS + Storage + Realtime)
//  - local.ts:    offline demo backend seeded with sample data, used when no
//                 Supabase credentials are configured so the app runs out of the box.
import type {
  Achievement, Activity, ActivityDraft, ActivityType, AppNotification, Challenge, Comment,
  Exercise, FollowStats, GeoPoint, Goal, LeaderMetric, LeaderRow, LeaderScope, Me,
  NotificationPrefs, Page, Profile, ProfilePrivate, Route, Visibility, WeightLog,
} from '@/lib/types';

export interface Session {
  userId: string;
  email: string | null;
}

export type ActivityPatch = Partial<Pick<Activity, 'title' | 'description' | 'visibility' | 'type'>>;
export type GoalInput = Omit<Goal, 'id' | 'user_id' | 'created_at' | 'status'> & { status?: Goal['status'] };

export interface Backend {
  readonly mode: 'supabase' | 'demo';

  // Auth
  getSession(): Promise<Session | null>;
  onAuthChange(cb: (s: Session | null) => void): () => void;
  signUp(email: string, password: string, fullName: string): Promise<{ needsConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;

  // Profile
  getMe(): Promise<Me>;
  updateProfile(patch: Partial<Omit<Profile, 'id' | 'created_at'>>): Promise<void>;
  updatePrivate(patch: Partial<Omit<ProfilePrivate, 'user_id'>>): Promise<void>;
  uploadAvatar(uri: string): Promise<string>;
  getProfile(id: string): Promise<Profile | null>;
  searchPeople(q: string): Promise<Profile[]>;
  suggestedPeople(): Promise<Profile[]>;
  followStats(userId: string): Promise<FollowStats>;
  follow(userId: string): Promise<void>;
  unfollow(userId: string): Promise<void>;
  acceptFollow(userId: string): Promise<void>;
  declineFollow(userId: string): Promise<void>;

  // Activities
  feed(cursor: string | null): Promise<Page<Activity>>;
  myActivities(): Promise<Activity[]>;
  userActivities(userId: string, cursor: string | null): Promise<Page<Activity>>;
  getActivity(id: string): Promise<Activity | null>;
  getActivityPoints(id: string): Promise<GeoPoint[]>;
  /** Idempotent on draft.client_id so offline retries never duplicate. */
  saveActivity(draft: ActivityDraft, mapPolyline: string | null, region: { region_lat: number | null; region_lng: number | null }): Promise<Activity>;
  updateActivity(id: string, patch: ActivityPatch): Promise<void>;
  deleteActivity(id: string): Promise<void>;
  addActivityPhotos(id: string, uris: string[]): Promise<void>;
  nearbyActivities(type?: ActivityType): Promise<Activity[]>;
  searchActivities(q: string): Promise<Activity[]>;

  // Social
  setLike(activityId: string, liked: boolean): Promise<void>;
  comments(activityId: string): Promise<Comment[]>;
  addComment(activityId: string, body: string): Promise<Comment>;
  deleteComment(id: string): Promise<void>;

  // Challenges, achievements, leaderboards
  challenges(): Promise<Challenge[]>;
  challenge(id: string): Promise<Challenge | null>;
  challengeLeaderboard(id: string): Promise<LeaderRow[]>;
  joinChallenge(id: string): Promise<void>;
  leaveChallenge(id: string): Promise<void>;
  achievements(userId: string): Promise<Achievement[]>;
  leaderboard(metric: LeaderMetric, since: Date, scope: LeaderScope): Promise<LeaderRow[]>;

  // Goals & weight
  goals(): Promise<Goal[]>;
  createGoal(g: GoalInput): Promise<Goal>;
  updateGoal(id: string, patch: Partial<GoalInput>): Promise<void>;
  deleteGoal(id: string): Promise<void>;
  weightLogs(): Promise<WeightLog[]>;
  addWeight(kg: number, date: string, note?: string | null): Promise<void>;
  deleteWeight(id: string): Promise<void>;

  // Notifications
  notifications(): Promise<AppNotification[]>;
  markRead(id?: string): Promise<void>;
  notificationPrefs(): Promise<NotificationPrefs>;
  updateNotificationPrefs(p: Partial<NotificationPrefs>): Promise<void>;
  subscribeNotifications(cb: () => void): () => void;

  // Catalogue
  exercises(): Promise<Exercise[]>;
  createExercise(name: string, category: Exercise['category'], muscle: string | null): Promise<Exercise>;
  routes(type?: ActivityType, q?: string): Promise<Route[]>;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  follow_requests: true, new_followers: true, likes: true, comments: true,
  challenges: true, records: true, streaks: true,
};

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: 'Everyone',
  followers: 'Followers',
  private: 'Only me',
};
