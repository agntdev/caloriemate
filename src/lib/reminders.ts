import type { Context } from "grammy";
import type { UserProfile } from "./types.js";
import { saveProfile, listEntriesForDay } from "./store.js";
import { cmpHm, timeHmInTz, todayKey } from "./time.js";
import { now } from "./clock.js";
import { dayTotal, formatKcal } from "./format.js";

type MealSlot = "breakfast" | "lunch" | "dinner" | "summary";

function slotTime(p: UserProfile, slot: MealSlot): string {
  switch (slot) {
    case "breakfast":
      return p.breakfastTime;
    case "lunch":
      return p.lunchTime;
    case "dinner":
      return p.dinnerTime;
    case "summary":
      return p.summaryTime;
  }
}

function lastField(slot: MealSlot): keyof UserProfile {
  switch (slot) {
    case "breakfast":
      return "lastBreakfastDate";
    case "lunch":
      return "lastLunchDate";
    case "dinner":
      return "lastDinnerDate";
    case "summary":
      return "lastSummaryDate";
  }
}

function mealCopy(slot: Exclude<MealSlot, "summary">): string {
  const label =
    slot === "breakfast" ? "breakfast" : slot === "lunch" ? "lunch" : "dinner";
  return `Time for ${label}. Log your meal when you're ready — open the menu and tap Start Tracking.`;
}

/**
 * Check whether any meal/summary reminders are due for this user and send them.
 * Safe to call on every interaction. Tolerates send failures (blocked bot).
 */
export async function maybeSendReminders(
  ctx: Context,
  profile: UserProfile,
): Promise<UserProfile> {
  if (!profile.remindersEnabled) return profile;
  const tz = profile.timezone || "UTC";
  const ms = now();
  const dateKey = todayKey(tz);
  const hm = timeHmInTz(ms, tz);
  let changed = false;
  const slots: MealSlot[] = ["breakfast", "lunch", "dinner", "summary"];

  for (const slot of slots) {
    const dueAt = slotTime(profile, slot);
    const last = profile[lastField(slot)] as string | undefined;
    if (last === dateKey) continue;
    if (cmpHm(hm, dueAt) < 0) continue;

    let text: string;
    if (slot === "summary") {
      const entries = await listEntriesForDay(profile.userId, dateKey);
      const total = dayTotal(entries);
      const left = profile.dailyTarget - total;
      text =
        `Daily summary for ${dateKey}\n` +
        `Eaten ${formatKcal(total)} of ${formatKcal(profile.dailyTarget)} ` +
        `(${left >= 0 ? formatKcal(left) + " left" : formatKcal(-left) + " over"}).`;
    } else {
      text = mealCopy(slot);
    }

    try {
      await ctx.api.sendMessage(profile.userId, text);
    } catch {
      // User blocked the bot or never started — skip without aborting.
    }
    (profile as unknown as Record<string, string>)[lastField(slot) as string] =
      dateKey;
    changed = true;
  }

  if (changed) await saveProfile(profile);
  return profile;
}

/**
 * Next due epoch-ms for a local HH:MM in the user's timezone (best-effort).
 * Used when scheduling Workers Durable Object alarms.
 */
export function nextOccurrenceMs(
  timeHm: string,
  timeZone: string,
  fromMs = now(),
): number {
  // Walk forward up to 48 hours in 1-minute steps — simple and timezone-safe.
  const start = fromMs - (fromMs % 60_000) + 60_000;
  for (let i = 0; i < 60 * 48; i++) {
    const t = start + i * 60_000;
    if (timeHmInTz(t, timeZone) === timeHm && todayKey(timeZone) /* force */) {
      const dk = (() => {
        try {
          return new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(t));
        } catch {
          return "";
        }
      })();
      const fromDk = (() => {
        try {
          return new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(fromMs));
        } catch {
          return "";
        }
      })();
      // Accept first matching clock time strictly after fromMs
      if (t > fromMs && (dk > fromDk || (dk === fromDk && timeHmInTz(fromMs, timeZone) < timeHm) || dk >= fromDk)) {
        return t;
      }
      if (t > fromMs) return t;
    }
  }
  return fromMs + 24 * 60 * 60 * 1000;
}
