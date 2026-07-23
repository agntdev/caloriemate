import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { requireProfile } from "../lib/require-profile.js";
import { saveProfile } from "../lib/store.js";
import { clearFlow } from "../lib/session.js";
import { formatKcal } from "../lib/format.js";
import { COMMON_TIMEZONES } from "../lib/time.js";
import { suggestedTarget } from "../lib/profile.js";
import type { Sex } from "../lib/types.js";

registerMainMenuItem({ label: "Settings", data: "settings:menu", order: 60 });

const composer = new Composer<Ctx>();

function settingsText(p: {
  dailyTarget: number;
  timezone: string;
  age?: number;
  sex?: string;
  heightCm?: number;
  weightKg?: number;
}): string {
  const profileLine =
    p.age != null
      ? `Profile: ${p.age}y, ${p.sex ?? "—"}, ${p.heightCm ?? "—"} cm, ${p.weightKg ?? "—"} kg`
      : "Profile: not set";
  return (
    `Settings\n\n` +
    `Daily target: ${formatKcal(p.dailyTarget)}\n` +
    `Timezone: ${p.timezone}\n` +
    `${profileLine}`
  );
}

function settingsKeyboard() {
  return inlineKeyboard([
    [inlineButton("Change target", "settings:target")],
    [inlineButton("Change timezone", "settings:tz")],
    [inlineButton("Update profile", "settings:profile")],
    [inlineButton("Back to menu", "menu:main")],
  ]);
}

composer.callbackQuery("settings:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  clearFlow(ctx.session);
  const text = settingsText(profile);
  try {
    await ctx.editMessageText(text, { reply_markup: settingsKeyboard() });
  } catch {
    await ctx.reply(text, { reply_markup: settingsKeyboard() });
  }
});

composer.callbackQuery("settings:target", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  ctx.session.step = "settings_target";
  await ctx.reply(
    `Current target is ${formatKcal(profile.dailyTarget)}. Send a new whole number (800–10000).`,
  );
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "settings_target") return next();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  const t = Number(ctx.message.text.trim());
  if (!Number.isFinite(t) || t < 800 || t > 10000) {
    await ctx.reply("Send a target between 800 and 10000 kcal.");
    return;
  }
  profile.dailyTarget = Math.round(t);
  await saveProfile(profile);
  clearFlow(ctx.session);
  await ctx.reply(`Daily target updated to ${formatKcal(profile.dailyTarget)}.`, {
    reply_markup: settingsKeyboard(),
  });
});

composer.callbackQuery("settings:tz", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  const rows = [];
  for (let i = 0; i < COMMON_TIMEZONES.length; i += 2) {
    const row = [
      inlineButton(COMMON_TIMEZONES[i]!.label, `onboard:tz:${COMMON_TIMEZONES[i]!.tz}`),
    ];
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
  rows.push([inlineButton("Back", "settings:menu")]);
  await ctx.reply("Pick your timezone. Reminder clock times stay the same locally.", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery("settings:profile", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  ctx.session.step = "onboard_age";
  await ctx.reply("How old are you? Send a whole number (years).");
});

// Reuse sex/height/weight handlers from start via same session steps —
// when already onboarded, finalize by updating profile + optional re-suggest.
composer.callbackQuery(/^settings:sex:(male|female|other)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.pendingSex = ctx.match[1] as Sex;
  ctx.session.step = "onboard_height";
  await ctx.reply("Height in centimeters? (e.g. 175)");
});

// After weight in start.ts for incomplete onboarding shows target accept.
// For completed profiles updating via settings:age path, start.ts weight
// handler will still set pendingTarget and show accept — which is fine.

composer.callbackQuery("settings:resuggest", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  const s = suggestedTarget({
    age: profile.age,
    sex: profile.sex,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
  });
  profile.dailyTarget = s;
  await saveProfile(profile);
  await ctx.reply(`Target recalculated to ${formatKcal(s)}.`, {
    reply_markup: settingsKeyboard(),
  });
});

export default composer;
