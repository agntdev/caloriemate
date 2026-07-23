/** Sex options for profile BMR calculation. */
export type Sex = "male" | "female" | "other";

/** How a log entry was created. */
export type EntrySource = "manual" | "database" | "photo";

/** Durable user profile (one per Telegram account). */
export interface UserProfile {
  userId: number;
  name: string;
  timezone: string;
  age?: number;
  sex?: Sex;
  heightCm?: number;
  weightKg?: number;
  dailyTarget: number;
  onboardingComplete: boolean;
  /** Local HH:MM times (24h) in the user's timezone. */
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
  summaryTime: string;
  remindersEnabled: boolean;
  /** Last dateKey each reminder fired, to avoid duplicates. */
  lastBreakfastDate?: string;
  lastLunchDate?: string;
  lastDinnerDate?: string;
  lastSummaryDate?: string;
}

/** Predefined food item in the built-in database. */
export interface FoodItem {
  id: string;
  name: string;
  kcalPerPortion: number;
  portionName: string;
}

/** A single calorie log entry. */
export interface LogEntry {
  id: string;
  userId: number;
  /** Epoch ms when the entry was logged. */
  timestamp: number;
  /** Calendar day in the user's timezone (YYYY-MM-DD). */
  dateKey: string;
  foodName: string;
  portion?: string;
  quantity: number;
  calories: number;
  source: EntrySource;
  confirmed: boolean;
}

/** Global bot settings (owner-configurable). */
export interface GlobalSettings {
  /** Experimental photo estimate default kcal when no vision API. */
  photoDefaultKcal: number;
  /** Whether photo estimates are enabled. */
  photoEnabled: boolean;
}

export const DEFAULT_REMINDER_TIMES = {
  breakfastTime: "08:00",
  lunchTime: "12:30",
  dinnerTime: "18:30",
  summaryTime: "21:00",
} as const;

export const DEFAULT_DAILY_TARGET = 2000;

export const DEFAULT_SETTINGS: GlobalSettings = {
  photoDefaultKcal: 500,
  photoEnabled: true,
};
