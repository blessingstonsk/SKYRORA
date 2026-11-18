// React Query hooks: caching, background refresh, optimistic social actions.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { Activity, ActivityType, LeaderMetric, LeaderScope, Page } from '@/lib/types';

import { api } from './index';

export const qk = {
  me: ['me'] as const,
  myActivities: ['activities', 'mine'] as const,
  feed: ['activities', 'feed'] as const,
  activity: (id: string) => ['activities', 'one', id] as const,
  points: (id: string) => ['activities', 'points', id] as const,
  userActivities: (id: string) => ['activities', 'user', id] as const,
  comments: (id: string) => ['comments', id] as const,
  profile: (id: string) => ['profile', id] as const,
  follow: (id: string) => ['follow', id] as const,
  challenges: ['challenges'] as const,
  challenge: (id: string) => ['challenges', id] as const,
  challengeBoard: (id: string) => ['challenges', id, 'board'] as const,
  achievements: (id: string) => ['achievements', id] as const,
  goals: ['goals'] as const,
  weights: ['weights'] as const,
  notifications: ['notifications'] as const,
  prefs: ['prefs'] as const,
  exercises: ['exercises'] as const,
  routes: (type?: string, q?: string) => ['routes', type ?? 'all', q ?? ''] as const,
  nearby: (type?: string) => ['nearby', type ?? 'all'] as const,
  leaderboard: (m: string, since: string, s: string) => ['leaderboard', m, since, s] as const,
  suggested: ['suggested'] as const,
};

export const useMe = (enabled = true) => useQuery({ queryKey: qk.me, queryFn: api.getMe, staleTime: 60_000, enabled });
export const useMyActivities = () => useQuery({ queryKey: qk.myActivities, queryFn: api.myActivities, staleTime: 30_000 });
export const useActivity = (id: string) => useQuery({ queryKey: qk.activity(id), queryFn: () => api.getActivity(id), enabled: !!id });
export const useActivityPoints = (id: string, enabled: boolean) =>
  useQuery({ queryKey: qk.points(id), queryFn: () => api.getActivityPoints(id), enabled: !!id && enabled, staleTime: Infinity });
export const useComments = (id: string) => useQuery({ queryKey: qk.comments(id), queryFn: () => api.comments(id) });
export const useProfile = (id: string) => useQuery({ queryKey: qk.profile(id), queryFn: () => api.getProfile(id) });
export const useFollowStats = (id: string) => useQuery({ queryKey: qk.follow(id), queryFn: () => api.followStats(id), enabled: !!id });
export const useChallenges = () => useQuery({ queryKey: qk.challenges, queryFn: api.challenges, staleTime: 60_000 });
export const useChallenge = (id: string) => useQuery({ queryKey: qk.challenge(id), queryFn: () => api.challenge(id) });
export const useChallengeBoard = (id: string) => useQuery({ queryKey: qk.challengeBoard(id), queryFn: () => api.challengeLeaderboard(id) });
export const useAchievements = (id: string | undefined) =>
  useQuery({ queryKey: qk.achievements(id ?? ''), queryFn: () => api.achievements(id!), enabled: !!id, staleTime: 300_000 });
export const useGoals = () => useQuery({ queryKey: qk.goals, queryFn: api.goals });
export const useWeights = () => useQuery({ queryKey: qk.weights, queryFn: api.weightLogs });
export const useNotificationPrefs = () => useQuery({ queryKey: qk.prefs, queryFn: api.notificationPrefs });
export const useExercises = () => useQuery({ queryKey: qk.exercises, queryFn: api.exercises, staleTime: Infinity });
export const useRoutes = (type?: ActivityType, q?: string) => useQuery({ queryKey: qk.routes(type, q), queryFn: () => api.routes(type, q), staleTime: 300_000 });
export const useNearby = (type?: ActivityType) => useQuery({ queryKey: qk.nearby(type), queryFn: () => api.nearbyActivities(type), staleTime: 120_000 });
export const useSuggested = () => useQuery({ queryKey: qk.suggested, queryFn: api.suggestedPeople, staleTime: 300_000 });
export const useLeaderboard = (metric: LeaderMetric, since: Date, scope: LeaderScope) =>
  useQuery({ queryKey: qk.leaderboard(metric, since.toISOString().slice(0, 10), scope), queryFn: () => api.leaderboard(metric, since, scope) });

export function useFeed() {
  return useInfiniteQuery({
    queryKey: qk.feed,
    queryFn: ({ pageParam }) => api.feed(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page<Activity>) => last.nextCursor,
    staleTime: 30_000,
  });
}

export function useUserActivities(userId: string) {
  return useInfiniteQuery({
    queryKey: qk.userActivities(userId),
    queryFn: ({ pageParam }) => api.userActivities(userId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: Page<Activity>) => last.nextCursor,
  });
}

/** Notifications with live updates (Supabase Realtime / local events). */
export function useNotifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.notifications, queryFn: api.notifications, staleTime: 30_000 });
  useEffect(() => api.subscribeNotifications(() => qc.invalidateQueries({ queryKey: qk.notifications })), [qc]);
  return q;
}

/** Apply a patch to an activity in every cached list it appears in. */
function patchActivityEverywhere(qc: QueryClient, id: string, fn: (a: Activity) => Activity) {
  qc.setQueriesData<{ pages: Page<Activity>[]; pageParams: unknown[] }>({ queryKey: ['activities'] }, (old) => {
    if (!old) return old;
    if (Array.isArray(old)) return (old as unknown as Activity[]).map((a) => (a.id === id ? fn(a) : a)) as never;
    if ('pages' in old) return { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((a) => (a.id === id ? fn(a) : a)) })) };
    if ((old as unknown as Activity).id === id) return fn(old as unknown as Activity) as never;
    return old;
  });
}

export function useLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, liked }: { id: string; liked: boolean }) => api.setLike(id, liked),
    onMutate: ({ id, liked }) => {
      patchActivityEverywhere(qc, id, (a) => ({ ...a, liked_by_me: liked, like_count: Math.max(0, a.like_count + (liked ? 1 : -1)) }));
    },
    onError: (_e, { id, liked }) => {
      patchActivityEverywhere(qc, id, (a) => ({ ...a, liked_by_me: !liked, like_count: Math.max(0, a.like_count + (liked ? -1 : 1)) }));
    },
  });
}

export function useAddComment(activityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.addComment(activityId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.comments(activityId) });
      patchActivityEverywhere(qc, activityId, (a) => ({ ...a, comment_count: a.comment_count + 1 }));
    },
  });
}

export function useFollow(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (follow: boolean) => (follow ? api.follow(userId) : api.unfollow(userId)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.follow(userId) });
      qc.invalidateQueries({ queryKey: qk.feed });
      qc.invalidateQueries({ queryKey: qk.suggested });
    },
  });
}

/** Invalidate everything derived from the user's activities. */
export function invalidateActivityData(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['activities'] }),
    qc.invalidateQueries({ queryKey: qk.challenges }),
    qc.invalidateQueries({ queryKey: ['achievements'] }),
    qc.invalidateQueries({ queryKey: qk.notifications }),
    qc.invalidateQueries({ queryKey: ['leaderboard'] }),
  ]);
}
