import type { Ctx } from "../bot.js";
import { getProfile } from "./store.js";
import type { UserProfile } from "./types.js";
import { maybeSendReminders } from "./reminders.js";
import { backMenuKeyboard } from "./ui.js";

/**
 * Load the user's profile. If missing or onboarding incomplete, nudge them
 * and return null. Also fires due reminders opportunistically.
 */
export async function requireProfile(ctx: Ctx): Promise<UserProfile | null> {
  const uid = ctx.from?.id;
  if (uid == null) return null;
  const profile = await getProfile(uid);
  if (!profile || !profile.onboardingComplete) {
    const text =
      "Finish setup first — tap /start to choose your timezone and daily target.";
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery();
      try {
        await ctx.editMessageText(text, { reply_markup: backMenuKeyboard() });
      } catch {
        await ctx.reply(text);
      }
    } else {
      await ctx.reply(text);
    }
    return null;
  }
  await maybeSendReminders(ctx, profile);
  return profile;
}

export function userName(ctx: Ctx): string {
  return ctx.from?.first_name ?? "there";
}
