import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { requireProfile } from "../lib/require-profile.js";
import { addLogEntry, getFood, listFoods } from "../lib/store.js";
import { todayKey } from "../lib/time.js";
import { now } from "../lib/clock.js";
import { clearFlow } from "../lib/session.js";
import { formatKcal } from "../lib/format.js";
import { backMenuKeyboard } from "../lib/ui.js";

registerMainMenuItem({ label: "Start Tracking", data: "tracking:start", order: 10 });

const composer = new Composer<Ctx>();

function methodKeyboard() {
  return inlineKeyboard([
    [inlineButton("Manual entry", "track:manual")],
    [inlineButton("Food database", "track:db")],
    [inlineButton("Photo tip", "track:photo_tip")],
    [inlineButton("Back to menu", "menu:main")],
  ]);
}

composer.callbackQuery("tracking:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  clearFlow(ctx.session);
  const text =
    "How do you want to log this meal?\n\n" +
    "Manual — type a food name and calories\n" +
    "Database — pick from common foods\n" +
    "Photo — send a meal photo for an experimental estimate";
  try {
    await ctx.editMessageText(text, { reply_markup: methodKeyboard() });
  } catch {
    await ctx.reply(text, { reply_markup: methodKeyboard() });
  }
});

composer.callbackQuery("track:photo_tip", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "Send a photo of your meal as a message. You'll get an experimental calorie estimate to confirm or adjust.",
    { reply_markup: backMenuKeyboard() },
  );
});

// ── Manual entry ──────────────────────────────────────────────────────

composer.callbackQuery("track:manual", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  clearFlow(ctx.session);
  ctx.session.step = "manual_food";
  ctx.session.pendingSource = "manual";
  await ctx.reply(
    "What's the food called? You can also send just a calorie number (e.g. 350).",
  );
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "manual_food") return next();
  const raw = ctx.message.text.trim();
  const asNum = Number(raw.replace(",", "."));
  if (Number.isFinite(asNum) && asNum > 0 && asNum < 10000 && /^\d+([.,]\d+)?$/.test(raw)) {
    ctx.session.pendingFoodName = "Quick entry";
    ctx.session.pendingCalories = Math.round(asNum);
    ctx.session.step = undefined;
    await confirmManual(ctx);
    return;
  }
  if (raw.length < 1 || raw.length > 80) {
    await ctx.reply("Send a short food name (or a calorie number).");
    return;
  }
  ctx.session.pendingFoodName = raw;
  ctx.session.step = "manual_calories";
  await ctx.reply(`How many calories for "${raw}"?`);
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "manual_calories") return next();
  const n = Number(ctx.message.text.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 10000) {
    await ctx.reply("Send a calorie amount between 1 and 10000.");
    return;
  }
  ctx.session.pendingCalories = Math.round(n);
  ctx.session.step = undefined;
  await confirmManual(ctx);
});

async function confirmManual(ctx: Ctx): Promise<void> {
  const name = ctx.session.pendingFoodName ?? "Food";
  const kcal = ctx.session.pendingCalories ?? 0;
  await ctx.reply(`Log ${name} — ${formatKcal(kcal)}?`, {
    reply_markup: inlineKeyboard([
      [
        inlineButton("Confirm", "track:manual_yes"),
        inlineButton("Cancel", "track:cancel"),
      ],
    ]),
  });
}

composer.callbackQuery("track:manual_yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  const name = ctx.session.pendingFoodName ?? "Food";
  const kcal = ctx.session.pendingCalories ?? 0;
  if (kcal <= 0) {
    await ctx.reply("Nothing to save — start again from Start Tracking.");
    return;
  }
  const entry = await addLogEntry({
    userId: profile.userId,
    timestamp: now(),
    dateKey: todayKey(profile.timezone),
    foodName: name,
    quantity: 1,
    calories: kcal,
    source: "manual",
    confirmed: true,
  });
  clearFlow(ctx.session);
  await ctx.reply(
    `Saved: ${entry.foodName} — ${formatKcal(entry.calories)}.\nOpen Today's Log to see your running total.`,
    { reply_markup: backMenuKeyboard() },
  );
});

composer.callbackQuery("track:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  clearFlow(ctx.session);
  await ctx.reply("Entry cancelled.", { reply_markup: backMenuKeyboard() });
});

// ── Database entry ────────────────────────────────────────────────────

composer.callbackQuery("track:db", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  clearFlow(ctx.session);
  await showFoodPage(ctx, 0);
});

composer.callbackQuery(/^track:db_page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showFoodPage(ctx, Number(ctx.match[1]));
});

async function showFoodPage(ctx: Ctx, page: number): Promise<void> {
  const foods = await listFoods();
  const per = 5;
  const totalPages = Math.max(1, Math.ceil(foods.length / per));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  const slice = foods.slice(p * per, p * per + per);
  const rows = slice.map((f) => [
    inlineButton(
      `${f.name} (${f.kcalPerPortion})`,
      `track:db_pick:${f.id}`,
    ),
  ]);
  const nav = [];
  if (p > 0) nav.push(inlineButton("Prev", `track:db_page:${p - 1}`));
  if (p < totalPages - 1) nav.push(inlineButton("Next", `track:db_page:${p + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([inlineButton("Back", "tracking:start")]);
  const text =
    foods.length === 0
      ? "Food database is empty. An owner can add items from Owner tools."
      : `Pick a food (page ${p + 1}/${totalPages}):`;
  try {
    await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
  } catch {
    await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
  }
}

composer.callbackQuery(/^track:db_pick:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const food = await getFood(ctx.match[1]!);
  if (!food) {
    await ctx.reply("That food is no longer in the database. Pick another.", {
      reply_markup: backMenuKeyboard(),
    });
    return;
  }
  ctx.session.pendingFoodId = food.id;
  ctx.session.pendingFoodName = food.name;
  ctx.session.pendingCalories = food.kcalPerPortion;
  ctx.session.pendingPortionQty = 1;
  ctx.session.pendingSource = "database";
  await ctx.reply(
    `${food.name} — ${formatKcal(food.kcalPerPortion)} per ${food.portionName}.\nHow many portions?`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("1", "track:db_qty:1"),
          inlineButton("2", "track:db_qty:2"),
          inlineButton("3", "track:db_qty:3"),
        ],
        [inlineButton("Custom amount", "track:db_qty_custom")],
        [inlineButton("Cancel", "track:cancel")],
      ]),
    },
  );
});

composer.callbackQuery(/^track:db_qty:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const qty = Number(ctx.match[1]);
  await confirmDb(ctx, qty);
});

composer.callbackQuery("track:db_qty_custom", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "db_qty";
  await ctx.reply("Send the number of portions (e.g. 1.5).");
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "db_qty") return next();
  const q = Number(ctx.message.text.trim().replace(",", "."));
  if (!Number.isFinite(q) || q <= 0 || q > 50) {
    await ctx.reply("Send a portion count between 0 and 50.");
    return;
  }
  ctx.session.step = undefined;
  await confirmDb(ctx, q);
});

async function confirmDb(ctx: Ctx, qty: number): Promise<void> {
  const food = ctx.session.pendingFoodId
    ? await getFood(ctx.session.pendingFoodId)
    : undefined;
  if (!food) {
    await ctx.reply("Food selection expired — open Food database again.");
    clearFlow(ctx.session);
    return;
  }
  const kcal = Math.round(food.kcalPerPortion * qty);
  ctx.session.pendingPortionQty = qty;
  ctx.session.pendingCalories = kcal;
  ctx.session.pendingFoodName = food.name;
  await ctx.reply(
    `Log ${qty}× ${food.name} (${food.portionName}) — ${formatKcal(kcal)}?`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("Confirm", "track:db_yes"),
          inlineButton("Cancel", "track:cancel"),
        ],
      ]),
    },
  );
}

composer.callbackQuery("track:db_yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  const food = ctx.session.pendingFoodId
    ? await getFood(ctx.session.pendingFoodId)
    : undefined;
  const qty = ctx.session.pendingPortionQty ?? 1;
  const kcal = ctx.session.pendingCalories ?? 0;
  if (!food || kcal <= 0) {
    await ctx.reply("Nothing to save — pick a food again.");
    return;
  }
  const entry = await addLogEntry({
    userId: profile.userId,
    timestamp: now(),
    dateKey: todayKey(profile.timezone),
    foodName: food.name,
    portion: food.portionName,
    quantity: qty,
    calories: kcal,
    source: "database",
    confirmed: true,
  });
  clearFlow(ctx.session);
  await ctx.reply(
    `Saved: ${entry.quantity}× ${entry.foodName} — ${formatKcal(entry.calories)}.`,
    { reply_markup: backMenuKeyboard() },
  );
});

export default composer;
