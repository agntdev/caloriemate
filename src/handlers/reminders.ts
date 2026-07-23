import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { requireProfile } from "../lib/require-profile.js";
import { saveProfile } from "../lib/store.js";
import { isValidHm } from "../lib/time.js";
import { clearFlow } from "../lib/session.js";
import { backMenuKeyboard } from "../lib/ui.js";

registerMainMenuItem({ label: "Reminders", data: "reminders:menu", order: 50 });

const composer = new Composer<Ctx>();

function menuText(p: {
  remindersEnabled: boolean;
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
  summaryTime: string;
  timezone: string;
}): string {
  const on = p.remindersEnabled ? "on" : "off";
  return (
    `Reminders are ${on} (${p.timezone}).\n\n` +
    `Breakfast ${p.breakfastTime}\n` +
    `Lunch ${p.lunchTime}\n` +
    `Dinner ${p.dinnerTime}\n` +
    `Daily summary ${p.summaryTime}\n\n` +
    "Times are in your local timezone. Tap a slot to change it."
  );
}

function menuKeyboard(enabled: boolean) {
  return inlineKeyboard([
    [
      inlineButton("Breakfast", "reminders:set:breakfast"),
      inlineButton("Lunch", "reminders:set:lunch"),
    ],
    [
      inlineButton("Dinner", "reminders:set:dinner"),
      inlineButton("Summary", "reminders:set:summary"),
    ],
    [
      inlineButton(
        enabled ? "Turn off" : "Turn on",
        enabled ? "reminders:off" : "reminders:on",
      ),
    ],
    [inlineButton("Back to menu", "menu:main")],
  ]);
}

composer.callbackQuery("reminders:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  clearFlow(ctx.session);
  const text = menuText(profile);
  const markup = menuKeyboard(profile.remindersEnabled);
  try {
    await ctx.editMessageText(text, { reply_markup: markup });
  } catch {
    await ctx.reply(text, { reply_markup: markup });
  }
});

composer.callbackQuery("reminders:on", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  profile.remindersEnabled = true;
  await saveProfile(profile);
  await ctx.editMessageText(menuText(profile), {
    reply_markup: menuKeyboard(true),
  });
});

composer.callbackQuery("reminders:off", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  profile.remindersEnabled = false;
  await saveProfile(profile);
  await ctx.editMessageText(menuText(profile), {
    reply_markup: menuKeyboard(false),
  });
});

composer.callbackQuery(
  /^reminders:set:(breakfast|lunch|dinner|summary)$/,
  async (ctx) => {
    await ctx.answerCallbackQuery();
    const profile = await requireProfile(ctx);
    if (!profile) return;
    const slot = ctx.match[1] as "breakfast" | "lunch" | "dinner" | "summary";
    ctx.session.pendingReminderSlot = slot;
    ctx.session.step = "reminder_time";
    await ctx.reply(
      `Send a new time for ${slot} as HH:MM (24-hour), e.g. 08:30.`,
    );
  },
);

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "reminder_time") return next();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  const slot = ctx.session.pendingReminderSlot;
  const t = ctx.message.text.trim();
  if (!slot || !isValidHm(t)) {
    await ctx.reply("Use HH:MM in 24-hour form, e.g. 13:45.");
    return;
  }
  switch (slot) {
    case "breakfast":
      profile.breakfastTime = t;
      profile.lastBreakfastDate = undefined;
      break;
    case "lunch":
      profile.lunchTime = t;
      profile.lastLunchDate = undefined;
      break;
    case "dinner":
      profile.dinnerTime = t;
      profile.lastDinnerDate = undefined;
      break;
    case "summary":
      profile.summaryTime = t;
      profile.lastSummaryDate = undefined;
      break;
  }
  await saveProfile(profile);
  clearFlow(ctx.session);
  await ctx.reply(
    `${slot[0]!.toUpperCase()}${slot.slice(1)} reminder set to ${t} (${profile.timezone}).`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Reminders", "reminders:menu")],
        [inlineButton("Back to menu", "menu:main")],
      ]),
    },
  );
});

export default composer;
