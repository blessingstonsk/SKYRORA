// Calorie and step estimates. These are rough estimates for motivation only,
// based on published MET (metabolic equivalent) tables — not medical measurements.
import type { ActivityType } from './types';

/** MET value from activity type and average speed (m/s). */
export function met(type: ActivityType, speedMps: number): number {
  const kmh = speedMps * 3.6;
  switch (type) {
    case 'run':
      if (kmh < 8) return 8.3;
      if (kmh < 9.7) return 9.8;
      if (kmh < 11.3) return 11;
      if (kmh < 12.9) return 11.8;
      if (kmh < 14.5) return 12.8;
      return 14.5;
    case 'walk':
      if (kmh < 3.2) return 2.8;
      if (kmh < 4.8) return 3.5;
      if (kmh < 5.6) return 4.3;
      return 5;
    case 'hike':
      return 6;
    case 'ride':
      if (kmh < 16) return 4;
      if (kmh < 19) return 6.8;
      if (kmh < 22.5) return 8;
      if (kmh < 25.7) return 10;
      return 12;
    case 'strength':
      return 5;
    case 'yoga':
      return 2.5;
    case 'swim':
      return 7;
    default:
      return 4;
  }
}

/** kcal = MET × weight(kg) × hours. Defaults to 70 kg when weight is unknown. */
export function estimateCalories(type: ActivityType, seconds: number, distanceM: number, weightKg?: number | null): number {
  if (seconds <= 0) return 0;
  const speed = distanceM / seconds;
  return Math.round(met(type, speed) * (weightKg || 70) * (seconds / 3600));
}

/** Stride length estimate from height (cm); used when the pedometer is unavailable. */
export function estimateSteps(type: ActivityType, distanceM: number, heightCm?: number | null): number | null {
  if (type !== 'walk' && type !== 'run' && type !== 'hike') return null;
  const h = (heightCm || 170) / 100;
  const stride = type === 'run' ? h * 0.65 * 1.6 : h * 0.415;
  return Math.round(distanceM / stride);
}

/** Strength sessions: base MET plus a small volume term. */
export function strengthCalories(minutes: number, weightKg?: number | null) {
  return Math.round(5 * (weightKg || 70) * (minutes / 60));
}
