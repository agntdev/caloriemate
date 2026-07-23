import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { requireProfile } from "../lib/require-profile.js";
import { listEntriesForDay, listRecentDays } from "../lib/store.js";
import { todayKey, shiftDateKey } from "../lib/time.js";
import { formatLogList } from "../lib/format.js";

registerMainMenuItem({ label: "Today's Log", data: "log:view_today", order: 20 });

const composer = new Composer<Ctx>();

async function showDay(ctx: Ctx, dateKey: string, edit: boolean): Promise<void> {
  const profile = await requireProfile(ctx);
  if (!profile) return;
  const entries = await listEntriesForDay(profile.userId, dateKey);
  const text = formatLogList(entries, profile, dateKey);
  const isToday = dateKey === todayKey(profile.timezone);
  const rows = [];
  const nav = [];
  // Past up to 30 days
  const prev = shiftDateKey(dateKey, -1);
  const recent = await listRecentDays(profile.userId, 30);
  const today = todayKey(profile.timezone);
  // Allow walking back 30 calendar days from today
  const oldest = shiftDateKey(today, -29);
  if (dateKey > oldest) {
    nav.push(inlineButton("Earlier", `log:day:${prev}`));
  }
  if (!isToday) {
    const next = shiftDateKey(dateKey, 1);
    if (next <= today) nav.push(inlineButton("Later", `log:day:${next}`));
    nav.push(inlineButton("Today", "log:view_today"));
  }
  if (nav.length) rows.push(nav);
  if (recent.length > 1) {
    rows.push([inlineButton("Recent days", "log:history")]);
  }
  rows.push([inlineButton("Back to menu", "menu:main")]);
  const markup = inlineKeyboard(rows);
  if (edit && ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { reply_markup: markup });
      return;
    } catch {
      /* fall through */
    }
  }
  await ctx.reply(text, { reply_markup: markup });
}

composer.callbackQuery("log:view_today", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  await showDay(ctx, todayKey(profile.timezone), true);
});

composer.callbackQuery(/^log:day:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showDay(ctx, ctx.match[1]!, true);
});

composer.callbackQuery("log:history", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  const days = await listRecentDays(profile.userId, 30);
  if (days.length === 0) {
    await ctx.editMessageText(
      "No past logs yet — tap Start Tracking to add your first meal.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }
  const rows = days.slice(0, 10).map((d) => [
    inlineButton(d, `log:day:${d}`),
  ]);
  rows.push([inlineButton("Back", "log:view_today")]);
  await ctx.editMessageText("Pick a day (up to 30 days of history):", {
    reply_markup: inlineKeyboard(rows),
  });
});

export default composer;
