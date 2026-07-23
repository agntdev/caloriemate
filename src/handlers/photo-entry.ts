import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getProfile, addLogEntry, getSettings } from "../lib/store.js";
import { todayKey } from "../lib/time.js";
import { now } from "../lib/clock.js";
import { clearFlow } from "../lib/session.js";
import { formatKcal } from "../lib/format.js";
import { backMenuKeyboard } from "../lib/ui.js";
import { maybeSendReminders } from "../lib/reminders.js";

const composer = new Composer<Ctx>();

/**
 * Experimental photo estimate.
 * Uses OpenRouter vision when OPENROUTER_API_KEY is set; otherwise a
 * deterministic default from settings (still requires confirmation).
 */
async function estimateFromPhoto(
  fileId: string,
  botToken: string | undefined,
): Promise<{ kcal: number; note: string }> {
  const settings = await getSettings();
  const key = typeof process !== "undefined" ? process.env.OPENROUTER_API_KEY : undefined;
  if (!key || !botToken) {
    return {
      kcal: settings.photoDefaultKcal,
      note: "experimental default — adjust if needed",
    };
  }
  try {
    const fileRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
    const fileJson = (await fileRes.json()) as {
      ok: boolean;
      result?: { file_path?: string };
    };
    const path = fileJson.result?.file_path;
    if (!path) throw new Error("no file path");
    const imgRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${path}`);
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    // Base64 without Buffer (Workers-safe)
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]!);
    const b64 = btoa(binary);
    const mime = path.endsWith(".png") ? "image/png" : "image/jpeg";

    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Estimate total calories in this meal photo. Reply with ONLY a JSON object: " +
                  '{"kcal":number,"desc":"short food name"}. No markdown.',
              },
              {
                type: "image_url",
                image_url: { url: `data:${mime};base64,${b64}` },
              },
            ],
          },
        ],
      }),
    });
    if (!aiRes.ok) throw new Error(`openrouter ${aiRes.status}`);
    const aiJson = (await aiRes.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = aiJson.choices?.[0]?.message?.content ?? "";
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no json");
    const parsed = JSON.parse(m[0]) as { kcal?: number; desc?: string };
    const kcal = Math.round(Number(parsed.kcal));
    if (!Number.isFinite(kcal) || kcal <= 0 || kcal > 10000) throw new Error("bad kcal");
    return {
      kcal,
      note: parsed.desc?.slice(0, 60) || "meal photo",
    };
  } catch {
    return {
      kcal: settings.photoDefaultKcal,
      note: "experimental default — adjust if needed",
    };
  }
}

composer.on("message:photo", async (ctx) => {
  const uid = ctx.from?.id;
  if (uid == null) return;
  const profile = await getProfile(uid);
  if (!profile || !profile.onboardingComplete) {
    await ctx.reply(
      "Finish setup first — tap /start to choose your timezone and daily target.",
    );
    return;
  }
  await maybeSendReminders(ctx, profile);

  const settings = await getSettings();
  if (!settings.photoEnabled) {
    await ctx.reply(
      "Photo estimates are turned off right now. Use Manual entry or the food database instead.",
      { reply_markup: backMenuKeyboard() },
    );
    return;
  }

  // Media group / multiple photos: take the largest size of this message only.
  // Telegram delivers each photo in an album as a separate update.
  const photos = ctx.message.photo;
  const best = photos[photos.length - 1];
  if (!best) return;

  if (ctx.message.media_group_id && ctx.session.step === "photo_adjust") {
    await ctx.reply(
      "Got another photo in that album — I'll stick with the first estimate. Confirm or adjust it below.",
    );
    return;
  }

  await ctx.reply("Estimating calories from your photo…");
  const token =
    typeof process !== "undefined" ? process.env.BOT_TOKEN : undefined;
  const est = await estimateFromPhoto(best.file_id, token);

  clearFlow(ctx.session);
  ctx.session.pendingPhotoEstimate = est.kcal;
  ctx.session.pendingCalories = est.kcal;
  ctx.session.pendingFoodName =
    est.note.startsWith("experimental") ? "Meal photo" : est.note;
  ctx.session.pendingPhotoDesc = ctx.session.pendingFoodName;
  ctx.session.pendingSource = "photo";
  ctx.session.step = "photo_adjust";

  await ctx.reply(
    `Experimental estimate: ${formatKcal(est.kcal)}` +
      (est.note ? ` (${est.note})` : "") +
      ".\n\nConfirm, adjust the number, or cancel.",
    {
      reply_markup: inlineKeyboard([
        [inlineButton(`Confirm ${est.kcal}`, "photo:confirm")],
        [inlineButton("Adjust amount", "photo:adjust")],
        [inlineButton("Cancel", "photo:cancel")],
      ]),
    },
  );
});

composer.callbackQuery("photo:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id;
  if (uid == null) return;
  const profile = await getProfile(uid);
  if (!profile) {
    await ctx.reply("Finish setup first — tap /start.");
    return;
  }
  const kcal = ctx.session.pendingCalories ?? ctx.session.pendingPhotoEstimate ?? 0;
  const name = ctx.session.pendingFoodName ?? "Meal photo";
  if (kcal <= 0) {
    await ctx.reply("Nothing to save — send a photo again.");
    return;
  }
  const entry = await addLogEntry({
    userId: profile.userId,
    timestamp: now(),
    dateKey: todayKey(profile.timezone),
    foodName: name,
    quantity: 1,
    calories: kcal,
    source: "photo",
    confirmed: true,
  });
  clearFlow(ctx.session);
  await ctx.reply(
    `Saved photo entry: ${entry.foodName} — ${formatKcal(entry.calories)}.`,
    { reply_markup: backMenuKeyboard() },
  );
});

composer.callbackQuery("photo:adjust", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "photo_adjust";
  await ctx.reply("Send the correct calorie amount as a number.");
});

composer.callbackQuery("photo:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  clearFlow(ctx.session);
  await ctx.reply("Photo entry cancelled.", { reply_markup: backMenuKeyboard() });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "photo_adjust") return next();
  // If they haven't tapped Adjust, still accept a number after the estimate prompt.
  const n = Number(ctx.message.text.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 10000) {
    await ctx.reply("Send a calorie amount between 1 and 10000, or tap Cancel.");
    return;
  }
  ctx.session.pendingCalories = Math.round(n);
  ctx.session.pendingPhotoEstimate = Math.round(n);
  await ctx.reply(`Use ${formatKcal(Math.round(n))} for this photo?`, {
    reply_markup: inlineKeyboard([
      [
        inlineButton("Confirm", "photo:confirm"),
        inlineButton("Cancel", "photo:cancel"),
      ],
    ]),
  });
});

export default composer;
