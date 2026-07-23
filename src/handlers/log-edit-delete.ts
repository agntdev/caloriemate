import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { requireProfile } from "../lib/require-profile.js";
import {
  listEntriesForDay,
  getLogEntry,
  updateLogEntry,
  deleteLogEntry,
} from "../lib/store.js";
import { todayKey } from "../lib/time.js";
import { clearFlow } from "../lib/session.js";
import { formatKcal } from "../lib/format.js";
import { backMenuKeyboard } from "../lib/ui.js";

registerMainMenuItem({ label: "Edit Entry", data: "log:edit_delete", order: 30 });

const composer = new Composer<Ctx>();

composer.callbackQuery("log:edit_delete", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  clearFlow(ctx.session);
  const entries = await listEntriesForDay(
    profile.userId,
    todayKey(profile.timezone),
  );
  if (entries.length === 0) {
    const text =
      "No entries today to edit — log a meal first, or open Today's Log for past days.";
    try {
      await ctx.editMessageText(text, { reply_markup: backMenuKeyboard() });
    } catch {
      await ctx.reply(text, { reply_markup: backMenuKeyboard() });
    }
    return;
  }
  const rows = entries.map((e) => [
    inlineButton(
      `${e.foodName} (${Math.round(e.calories)})`,
      `log:pick:${e.id}`,
    ),
  ]);
  rows.push([inlineButton("Back to menu", "menu:main")]);
  const text = "Pick an entry from today to edit or delete:";
  try {
    await ctx.editMessageText(text, { reply_markup: inlineKeyboard(rows) });
  } catch {
    await ctx.reply(text, { reply_markup: inlineKeyboard(rows) });
  }
});

composer.callbackQuery(/^log:pick:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  const id = ctx.match[1]!;
  const entry = await getLogEntry(profile.userId, id);
  if (!entry) {
    await ctx.reply(
      "That entry is gone — it may already have been deleted. Open Edit Entry again.",
      { reply_markup: backMenuKeyboard() },
    );
    return;
  }
  ctx.session.pendingEditId = id;
  await ctx.reply(
    `${entry.foodName} — ${formatKcal(entry.calories)}` +
      (entry.portion ? ` · ${entry.quantity}× ${entry.portion}` : "") +
      "\n\nWhat do you want to do?",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Edit calories", "log:edit_kcal")],
        [inlineButton("Edit name", "log:edit_name")],
        [inlineButton("Delete", "log:delete_ask")],
        [inlineButton("Back", "log:edit_delete")],
      ]),
    },
  );
});

composer.callbackQuery("log:edit_kcal", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.pendingEditId) {
    await ctx.reply("Pick an entry first.", { reply_markup: backMenuKeyboard() });
    return;
  }
  ctx.session.step = "edit_calories";
  await ctx.reply("Send the new calorie amount.");
});

composer.callbackQuery("log:edit_name", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.pendingEditId) {
    await ctx.reply("Pick an entry first.", { reply_markup: backMenuKeyboard() });
    return;
  }
  ctx.session.step = "edit_name";
  await ctx.reply("Send the new food name.");
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "edit_calories") return next();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  const id = ctx.session.pendingEditId;
  if (!id) {
    clearFlow(ctx.session);
    await ctx.reply("Pick an entry first.", { reply_markup: backMenuKeyboard() });
    return;
  }
  const n = Number(ctx.message.text.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 10000) {
    await ctx.reply("Send a calorie amount between 1 and 10000.");
    return;
  }
  const entry = await getLogEntry(profile.userId, id);
  if (!entry) {
    clearFlow(ctx.session);
    await ctx.reply(
      "That entry is gone — it may already have been deleted.",
      { reply_markup: backMenuKeyboard() },
    );
    return;
  }
  entry.calories = Math.round(n);
  await updateLogEntry(entry);
  clearFlow(ctx.session);
  await ctx.reply(`Updated to ${formatKcal(entry.calories)}.`, {
    reply_markup: backMenuKeyboard(),
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "edit_name") return next();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  const id = ctx.session.pendingEditId;
  if (!id) {
    clearFlow(ctx.session);
    await ctx.reply("Pick an entry first.", { reply_markup: backMenuKeyboard() });
    return;
  }
  const name = ctx.message.text.trim();
  if (name.length < 1 || name.length > 80) {
    await ctx.reply("Send a short food name.");
    return;
  }
  const entry = await getLogEntry(profile.userId, id);
  if (!entry) {
    clearFlow(ctx.session);
    await ctx.reply(
      "That entry is gone — it may already have been deleted.",
      { reply_markup: backMenuKeyboard() },
    );
    return;
  }
  entry.foodName = name;
  await updateLogEntry(entry);
  clearFlow(ctx.session);
  await ctx.reply(`Renamed to "${name}".`, { reply_markup: backMenuKeyboard() });
});

composer.callbackQuery("log:delete_ask", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.pendingEditId) {
    await ctx.reply("Pick an entry first.", { reply_markup: backMenuKeyboard() });
    return;
  }
  await ctx.reply("Delete this entry permanently?", {
    reply_markup: inlineKeyboard([
      [
        inlineButton("Yes, delete", "log:delete_yes"),
        inlineButton("Keep it", "log:edit_delete"),
      ],
    ]),
  });
});

composer.callbackQuery("log:delete_yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;
  const id = ctx.session.pendingEditId;
  if (!id) {
    await ctx.reply("Nothing selected.", { reply_markup: backMenuKeyboard() });
    return;
  }
  const ok = await deleteLogEntry(profile.userId, id);
  clearFlow(ctx.session);
  if (!ok) {
    await ctx.reply(
      "Couldn't delete that entry — it may already be gone.",
      { reply_markup: backMenuKeyboard() },
    );
    return;
  }
  await ctx.reply("Entry deleted.", { reply_markup: backMenuKeyboard() });
});

export default composer;
