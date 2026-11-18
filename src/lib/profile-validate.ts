import type { ProfileFormValue } from '@/components/profile-form';

import { cleanText, numberIn, usernameProblem } from './validation';

export function validateProfile(v: ProfileFormValue, step: 'identity' | 'body' | 'all') {
  const e: Record<string, string | null> = {};
  if (step !== 'body') {
    if (cleanText(v.full_name, 60).length < 2) e.full_name = 'Enter your name';
    e.username = usernameProblem(v.username);
  }
  if (step !== 'identity') {
    if (v.age && numberIn(v.age, 13, 120) == null) e.age = '13–120';
    if (v.height && numberIn(v.height, 80, 260) == null) e.height = '80–260 cm';
    if (v.weight && numberIn(v.weight, 20, 400) == null) e.weight = '20–400 kg';
  }
  return { errors: e, ok: Object.values(e).every((x) => !x) };
}

export function toPatches(v: ProfileFormValue) {
  return {
    profile: { full_name: cleanText(v.full_name, 60), username: v.username.trim(), bio: cleanText(v.bio, 280) || null },
    private: {
      age: v.age ? Number(v.age) : null,
      gender: v.gender,
      height_cm: v.height ? numberIn(v.height, 80, 260) : null,
      weight_kg: v.weight ? numberIn(v.weight, 20, 400) : null,
      fitness_goal: v.goal,
      activity_prefs: v.prefs,
    },
  };
}
