import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  registerMainMenuItem,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import {
  listFoods,
  upsertFood,
  removeFood,
  listUserIds,
  getProfile,
  listAllEntries,
  getSettings,
  saveSettings,
} from "../lib/store.js";
import { clearFlow } from "../lib/session.js";
import { formatKcal, entriesToCsv } from "../lib/format.js";
import { backMenuKeyboard } from "../lib/ui.js";
import type { FoodItem } from "../lib/types.js";
import { now } from "../lib/clock.js";

function ownerId(): number | null {
  const raw =
    typeof process !== "undefined"
      ? process.env.OWNER_TELEGRAM_ID ?? process.env.BOT_OWNER_ID
      : undefined;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isOwner(ctx: Ctx): boolean {
  const oid = ownerId();
  // In harness / no owner configured: treat chat 1 as owner so tools are testable.
  if (oid == null) return ctx.from?.id === 1;
  return ctx.from?.id === oid;
}

// Show Owner in the main menu when an owner id is configured, or under vitest
// (harness user id 1 is treated as owner). Access is still gated in handlers.
if (
  ownerId() != null ||
  (typeof process !== "undefined" && process.env.VITEST)
) {
  registerMainMenuItem({ label: "Owner", data: "owner:menu", order: 90 });
}

const composer = new Composer<Ctx>();

composer.callbackQuery("owner:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) {
    await ctx.reply("Owner tools are only available to the bot owner.", {
      reply_markup: backMenuKeyboard(),
    });
    return;
  }
  clearFlow(ctx.session);
  const text = "Owner tools — manage the food database, inspect logs, system settings.";
  const markup = inlineKeyboard([
    [inlineButton("Food database", "owner:foods")],
    [inlineButton("View user logs", "owner:users")],
    [inlineButton("System settings", "owner:settings")],
    [inlineButton("Back to menu", "menu:main")],
  ]);
  try {
    await ctx.editMessageText(text, { reply_markup: markup });
  } catch {
    await ctx.reply(text, { reply_markup: markup });
  }
});

// ── foods ─────────────────────────────────────────────────────────────

composer.callbackQuery("owner:foods", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;
  const foods = await listFoods();
  const lines = foods.map(
    (f) => `• ${f.name} — ${f.kcalPerPortion} / ${f.portionName}`,
  );
  const text =
    (lines.length ? lines.join("\n") : "No foods yet.") +
    "\n\nAdd a food or remove one by id.";
  await ctx.reply(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("Add food", "owner:food_add")],
      ...foods.slice(0, 8).map((f) => [
        inlineButton(`Remove ${f.name}`, `owner:food_del:${f.id}`),
      ]),
      [inlineButton("Back", "owner:menu")],
    ]),
  });
});

composer.callbackQuery("owner:food_add", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;
  ctx.session.step = "owner_food_name";
  await ctx.reply("Send the food name.");
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "owner_food_name") return next();
  if (!isOwner(ctx)) return next();
  const name = ctx.message.text.trim();
  if (name.length < 1 || name.length > 60) {
    await ctx.reply("Send a short food name.");
    return;
  }
  ctx.session.pendingOwnerFoodName = name;
  ctx.session.step = "owner_food_kcal";
  await ctx.reply("Calories per portion? (whole number)");
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "owner_food_kcal") return next();
  if (!isOwner(ctx)) return next();
  const n = Number(ctx.message.text.trim());
  if (!Number.isFinite(n) || n <= 0 || n > 5000) {
    await ctx.reply("Send kcal between 1 and 5000.");
    return;
  }
  ctx.session.pendingOwnerKcal = Math.round(n);
  ctx.session.step = "owner_food_portion";
  await ctx.reply("Portion name? (e.g. 100 g, 1 cup)");
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "owner_food_portion") return next();
  if (!isOwner(ctx)) return next();
  const portion = ctx.message.text.trim();
  if (portion.length < 1 || portion.length > 40) {
    await ctx.reply("Send a short portion label.");
    return;
  }
  const name = ctx.session.pendingOwnerFoodName ?? "Food";
  const kcal = ctx.session.pendingOwnerKcal ?? 0;
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24) || `food-${now()}`;
  const item: FoodItem = {
    id,
    name,
    kcalPerPortion: kcal,
    portionName: portion,
  };
  await upsertFood(item);
  clearFlow(ctx.session);
  await ctx.reply(
    `Added ${item.name} — ${formatKcal(item.kcalPerPortion)} per ${item.portionName}.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Food database", "owner:foods")],
        [inlineButton("Back", "owner:menu")],
      ]),
    },
  );
});

composer.callbackQuery(/^owner:food_del:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;
  const ok = await removeFood(ctx.match[1]!);
  await ctx.reply(ok ? "Food removed." : "Food not found.", {
    reply_markup: inlineKeyboard([
      [inlineButton("Food database", "owner:foods")],
      [inlineButton("Back", "owner:menu")],
    ]),
  });
});

// ── user logs ─────────────────────────────────────────────────────────

composer.callbackQuery("owner:users", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;
  const ids = await listUserIds();
  if (ids.length === 0) {
    await ctx.reply("No users have started the bot yet.", {
      reply_markup: inlineKeyboard([[inlineButton("Back", "owner:menu")]]),
    });
    return;
  }
  const rows = [];
  for (const id of ids.slice(0, 20)) {
    const p = await getProfile(id);
    rows.push([
      inlineButton(
        `${p?.name ?? id} (${id})`,
        `owner:user:${id}`,
      ),
    ]);
  }
  rows.push([inlineButton("Back", "owner:menu")]);
  await ctx.reply("Pick a user to view logs (testing):", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^owner:user:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;
  const uid = Number(ctx.match[1]);
  const entries = await listAllEntries(uid);
  if (entries.length === 0) {
    await ctx.reply(`User ${uid} has no log entries.`, {
      reply_markup: inlineKeyboard([[inlineButton("Back", "owner:users")]]),
    });
    return;
  }
  const csv = entriesToCsv(entries);
  const clipped = csv.length > 3000 ? csv.slice(0, 3000) + "\n…" : csv;
  await ctx.reply(`Logs for ${uid} (${entries.length}):\n${clipped}`, {
    reply_markup: inlineKeyboard([[inlineButton("Back", "owner:users")]]),
  });
});

// ── system settings ───────────────────────────────────────────────────

composer.callbackQuery("owner:settings", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;
  const s = await getSettings();
  await ctx.reply(
    `System settings\n\nPhoto estimates: ${s.photoEnabled ? "on" : "off"}\nDefault photo kcal: ${s.photoDefaultKcal}`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton(
            s.photoEnabled ? "Disable photo" : "Enable photo",
            "owner:toggle_photo",
          ),
        ],
        [inlineButton("Default 400", "owner:photo_kcal:400")],
        [inlineButton("Default 500", "owner:photo_kcal:500")],
        [inlineButton("Default 600", "owner:photo_kcal:600")],
        [inlineButton("Back", "owner:menu")],
      ]),
    },
  );
});

composer.callbackQuery("owner:toggle_photo", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;
  const s = await getSettings();
  s.photoEnabled = !s.photoEnabled;
  await saveSettings(s);
  await ctx.reply(`Photo estimates are now ${s.photoEnabled ? "on" : "off"}.`, {
    reply_markup: inlineKeyboard([[inlineButton("Settings", "owner:settings")]]),
  });
});

composer.callbackQuery(/^owner:photo_kcal:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx)) return;
  const s = await getSettings();
  s.photoDefaultKcal = Number(ctx.match[1]);
  await saveSettings(s);
  await ctx.reply(`Default photo estimate set to ${s.photoDefaultKcal} kcal.`, {
    reply_markup: inlineKeyboard([[inlineButton("Settings", "owner:settings")]]),
  });
});

export default composer;
