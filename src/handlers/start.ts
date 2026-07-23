import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getProfile, saveProfile } from "../lib/store.js";
import { blankProfile, suggestedTarget } from "../lib/profile.js";
import { COMMON_TIMEZONES } from "../lib/time.js";
import { clearFlow } from "../lib/session.js";
import { maybeSendReminders } from "../lib/reminders.js";
import type { Sex } from "../lib/types.js";
import { DEFAULT_DAILY_TARGET } from "../lib/types.js";
import { formatKcal } from "../lib/format.js";

const composer = new Composer<Ctx>();

export const WELCOME =
  "CalorieMate — track meals, hit your daily target, and export your log.\n\n" +
  "Tap a button below to get started.";

function tzKeyboard() {
  const rows = [];
  for (let i = 0; i < COMMON_TIMEZONES.length; i += 2) {
    const row = [inlineButton(COMMON_TIMEZONES[i]!.label, `onboard:tz:${COMMON_TIMEZONES[i]!.tz}`)];
    if (COMMON_TIMEZONES[i + 1]) {
      row.push(
        inlineButton(
          COMMON_TIMEZONES[i + 1]!.label,
          `onboard:tz:${COMMON_TIMEZONES[i + 1]!.tz}`,
        ),
      );
    }
    rows.push(row);
  }
  rows.push([inlineButton("Other timezone", "onboard:tz_other")]);
  return inlineKeyboard(rows);
}

async function beginOnboarding(ctx: Ctx, name: string): Promise<void> {
  clearFlow(ctx.session);
  const uid = ctx.from!.id;
  let profile = await getProfile(uid);
  if (!profile) {
    profile = blankProfile(uid, name);
    await saveProfile(profile);
  }
  await ctx.reply(
    "Welcome to CalorieMate.\n\nFirst, pick your timezone so daily totals and reminders land on the right day.",
    { reply_markup: tzKeyboard() },
  );
}

async function showMainMenu(ctx: Ctx, edit: boolean): Promise<void> {
  clearFlow(ctx.session);
  if (edit && ctx.callbackQuery) {
    try {
      await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
      return;
    } catch {
      /* fall through */
    }
  }
  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
}

composer.command("start", async (ctx) => {
  const uid = ctx.from?.id;
  if (uid == null) return;
  const name = ctx.from?.first_name ?? "there";
  const profile = await getProfile(uid);
  if (!profile || !profile.onboardingComplete) {
    await beginOnboarding(ctx, name);
    return;
  }
  await maybeSendReminders(ctx, profile);
  await showMainMenu(ctx, false);
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id;
  if (uid == null) return;
  const profile = await getProfile(uid);
  if (!profile || !profile.onboardingComplete) {
    await beginOnboarding(ctx, ctx.from?.first_name ?? "there");
    return;
  }
  await showMainMenu(ctx, true);
});

// ── timezone ──────────────────────────────────────────────────────────

composer.callbackQuery(/^onboard:tz:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const tz = ctx.match[1]!;
  await setTimezoneAndContinue(ctx, tz);
});

composer.callbackQuery("onboard:tz_other", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "onboard_tz_custom";
  await ctx.reply(
    "Send your IANA timezone, for example Europe/Paris or America/Denver.",
  );
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "onboard_tz_custom") return next();
  const raw = ctx.message.text.trim();
  if (!isValidTimezone(raw)) {
    await ctx.reply(
      "That timezone isn't recognized. Try something like Europe/Berlin or America/New_York.",
    );
    return;
  }
  ctx.session.step = undefined;
  await setTimezoneAndContinue(ctx, raw);
});

async function setTimezoneAndContinue(ctx: Ctx, tz: string): Promise<void> {
  const uid = ctx.from!.id;
  let profile = await getProfile(uid);
  if (!profile) profile = blankProfile(uid, ctx.from?.first_name ?? "there", tz);
  // Changing timezone after setup: keep times, clear last-fired so reminders re-evaluate.
  const wasComplete = profile.onboardingComplete;
  profile.timezone = tz;
  if (wasComplete) {
    profile.lastBreakfastDate = undefined;
    profile.lastLunchDate = undefined;
    profile.lastDinnerDate = undefined;
    profile.lastSummaryDate = undefined;
    await saveProfile(profile);
    await ctx.reply(
      `Timezone updated to ${tz}. Reminder times stay the same in your local clock.`,
      { reply_markup: mainMenuKeyboard() },
    );
    return;
  }
  await saveProfile(profile);
  await ctx.reply(
    `Timezone set to ${tz}.\n\nWant a suggested daily target from a quick profile (age, sex, height, weight)?`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Set up profile", "onboard:profile")],
        [inlineButton("Skip profile", "onboard:skip_profile")],
      ]),
    },
  );
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ── profile ───────────────────────────────────────────────────────────

composer.callbackQuery("onboard:skip_profile", async (ctx) => {
  await ctx.answerCallbackQuery();
  const suggest = DEFAULT_DAILY_TARGET;
  ctx.session.pendingTarget = suggest;
  await ctx.reply(
    `Suggested daily target: ${formatKcal(suggest)} (default).\n\nAccept it or set your own.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton(`Accept ${suggest}`, "onboard:accept_target")],
        [inlineButton("Custom target", "onboard:custom_target")],
      ]),
    },
  );
});

composer.callbackQuery("onboard:profile", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "onboard_age";
  await ctx.reply("How old are you? Send a whole number (years).");
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "onboard_age") return next();
  const age = Number(ctx.message.text.trim());
  if (!Number.isFinite(age) || age < 10 || age > 120) {
    await ctx.reply("Send an age between 10 and 120.");
    return;
  }
  ctx.session.pendingAge = Math.round(age);
  ctx.session.step = undefined;
  await ctx.reply("Sex (used only for the calorie estimate):", {
    reply_markup: inlineKeyboard([
      [
        inlineButton("Male", "onboard:sex:male"),
        inlineButton("Female", "onboard:sex:female"),
      ],
      [inlineButton("Other", "onboard:sex:other")],
    ]),
  });
});

composer.callbackQuery(/^onboard:sex:(male|female|other)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.pendingSex = ctx.match[1] as Sex;
  ctx.session.step = "onboard_height";
  await ctx.reply("Height in centimeters? (e.g. 175)");
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "onboard_height") return next();
  const h = Number(ctx.message.text.trim());
  if (!Number.isFinite(h) || h < 100 || h > 250) {
    await ctx.reply("Send height in cm between 100 and 250.");
    return;
  }
  ctx.session.pendingHeight = Math.round(h);
  ctx.session.step = "onboard_weight";
  await ctx.reply("Weight in kilograms? (e.g. 70)");
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "onboard_weight") return next();
  const w = Number(ctx.message.text.trim().replace(",", "."));
  if (!Number.isFinite(w) || w < 30 || w > 300) {
    await ctx.reply("Send weight in kg between 30 and 300.");
    return;
  }
  ctx.session.pendingWeight = Math.round(w * 10) / 10;
  ctx.session.step = undefined;
  const suggest = suggestedTarget({
    age: ctx.session.pendingAge,
    sex: ctx.session.pendingSex,
    heightCm: ctx.session.pendingHeight,
    weightKg: ctx.session.pendingWeight,
  });
  ctx.session.pendingTarget = suggest;
  await ctx.reply(
    `Based on your profile, a solid daily target is ${formatKcal(suggest)}.\n\nAccept it or set your own.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton(`Accept ${suggest}`, "onboard:accept_target")],
        [inlineButton("Custom target", "onboard:custom_target")],
      ]),
    },
  );
});

composer.callbackQuery("onboard:custom_target", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "onboard_target_custom";
  await ctx.reply("Send your daily calorie target as a whole number (e.g. 1800).");
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "onboard_target_custom") return next();
  const t = Number(ctx.message.text.trim());
  if (!Number.isFinite(t) || t < 800 || t > 10000) {
    await ctx.reply("Send a target between 800 and 10000 kcal.");
    return;
  }
  ctx.session.pendingTarget = Math.round(t);
  ctx.session.step = undefined;
  await finalizeOnboarding(ctx);
});

composer.callbackQuery("onboard:accept_target", async (ctx) => {
  await ctx.answerCallbackQuery();
  await finalizeOnboarding(ctx);
});

async function finalizeOnboarding(ctx: Ctx): Promise<void> {
  const uid = ctx.from!.id;
  let profile = await getProfile(uid);
  if (!profile) profile = blankProfile(uid, ctx.from?.first_name ?? "there");
  if (ctx.session.pendingAge != null) profile.age = ctx.session.pendingAge;
  if (ctx.session.pendingSex) profile.sex = ctx.session.pendingSex;
  if (ctx.session.pendingHeight != null) profile.heightCm = ctx.session.pendingHeight;
  if (ctx.session.pendingWeight != null) profile.weightKg = ctx.session.pendingWeight;
  profile.dailyTarget = ctx.session.pendingTarget ?? DEFAULT_DAILY_TARGET;
  profile.onboardingComplete = true;
  profile.name = ctx.from?.first_name ?? profile.name;
  await saveProfile(profile);
  clearFlow(ctx.session);
  await ctx.reply(
    `You're set. Daily target: ${formatKcal(profile.dailyTarget)}.\n\n` +
      "Use the menu to log meals, check today's total, or export your history.",
    { reply_markup: mainMenuKeyboard() },
  );
}

export default composer;
