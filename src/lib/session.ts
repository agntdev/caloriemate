import type { EntrySource, Sex } from "./types.js";

export type FlowStep =
  | "onboard_tz_custom"
  | "onboard_age"
  | "onboard_height"
  | "onboard_weight"
  | "onboard_target_custom"
  | "manual_food"
  | "manual_calories"
  | "db_qty"
  | "photo_adjust"
  | "edit_calories"
  | "edit_name"
  | "reminder_time"
  | "owner_food_name"
  | "owner_food_kcal"
  | "owner_food_portion"
  | "settings_target";

export interface SessionData {
  step?: FlowStep | string;
  pendingTz?: string;
  pendingAge?: number;
  pendingSex?: Sex;
  pendingHeight?: number;
  pendingWeight?: number;
  pendingTarget?: number;
  pendingFoodName?: string;
  pendingCalories?: number;
  pendingFoodId?: string;
  pendingPortionQty?: number;
  pendingPhotoEstimate?: number;
  pendingPhotoDesc?: string;
  pendingEditId?: string;
  pendingReminderSlot?: "breakfast" | "lunch" | "dinner" | "summary";
  pendingOwnerFoodName?: string;
  pendingOwnerKcal?: number;
  pendingSource?: EntrySource;
}

/** Clear multi-step flow fields. */
export function clearFlow(s: SessionData): void {
  s.step = undefined;
  s.pendingTz = undefined;
  s.pendingAge = undefined;
  s.pendingSex = undefined;
  s.pendingHeight = undefined;
  s.pendingWeight = undefined;
  s.pendingTarget = undefined;
  s.pendingFoodName = undefined;
  s.pendingCalories = undefined;
  s.pendingFoodId = undefined;
  s.pendingPortionQty = undefined;
  s.pendingPhotoEstimate = undefined;
  s.pendingPhotoDesc = undefined;
  s.pendingEditId = undefined;
  s.pendingReminderSlot = undefined;
  s.pendingOwnerFoodName = undefined;
  s.pendingOwnerKcal = undefined;
  s.pendingSource = undefined;
}
