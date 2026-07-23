import type { Sex, UserProfile } from "./types.js";
import { DEFAULT_DAILY_TARGET, DEFAULT_REMINDER_TIMES } from "./types.js";

/**
 * Mifflin-St Jeor BMR × sedentary activity (1.2), rounded to nearest 50.
 * Falls back to DEFAULT_DAILY_TARGET when profile data is incomplete.
 */
export function suggestedTarget(opts: {
  age?: number;
  sex?: Sex;
  heightCm?: number;
  weightKg?: number;
}): number {
  const { age, sex, heightCm, weightKg } = opts;
  if (
    age == null ||
    sex == null ||
    heightCm == null ||
    weightKg == null ||
    age <= 0 ||
    heightCm <= 0 ||
    weightKg <= 0
  ) {
    return DEFAULT_DAILY_TARGET;
  }
  // BMR: men 10w+6.25h-5a+5; women 10w+6.25h-5a-161; other uses average offset
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const bmr =
    sex === "male" ? base + 5 : sex === "female" ? base - 161 : base - 78;
  const tdee = bmr * 1.2;
  return Math.max(1000, Math.round(tdee / 50) * 50);
}

export function blankProfile(
  userId: number,
  name: string,
  timezone = "UTC",
): UserProfile {
  return {
    userId,
    name,
    timezone,
    dailyTarget: DEFAULT_DAILY_TARGET,
    onboardingComplete: false,
    breakfastTime: DEFAULT_REMINDER_TIMES.breakfastTime,
    lunchTime: DEFAULT_REMINDER_TIMES.lunchTime,
    dinnerTime: DEFAULT_REMINDER_TIMES.dinnerTime,
    summaryTime: DEFAULT_REMINDER_TIMES.summaryTime,
    remindersEnabled: true,
  };
}
