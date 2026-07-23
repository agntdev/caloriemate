import { Composer, InputFile } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { requireProfile } from "../lib/require-profile.js";
import { listAllEntries } from "../lib/store.js";
import { entriesToCsv } from "../lib/format.js";
import { backMenuKeyboard } from "../lib/ui.js";

registerMainMenuItem({ label: "Export CSV", data: "export:csv", order: 40 });

const composer = new Composer<Ctx>();

composer.callbackQuery("export:csv", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = await requireProfile(ctx);
  if (!profile) return;

  const entries = await listAllEntries(profile.userId);
  if (entries.length === 0) {
    const text =
      "No logs to export yet — track a meal first, then come back for your CSV.";
    try {
      await ctx.editMessageText(text, { reply_markup: backMenuKeyboard() });
    } catch {
      await ctx.reply(text, { reply_markup: backMenuKeyboard() });
    }
    return;
  }

  const csv = entriesToCsv(entries);
  const filename = `calories-${profile.userId}.csv`;
  // Workers-safe: Blob + InputFile (no Node Buffer required).
  const bytes = new TextEncoder().encode(csv);
  const file = new InputFile(bytes, filename);

  await ctx.reply(`Export ready — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}.`);
  try {
    await ctx.replyWithDocument(file, {
      caption: "Your calorie log as CSV.",
    });
  } catch {
    // Fallback: paste CSV if document send fails (e.g. harness).
    const clipped = csv.length > 3500 ? csv.slice(0, 3500) + "\n…" : csv;
    await ctx.reply(`CSV data:\n${clipped}`, { reply_markup: backMenuKeyboard() });
  }
});

export default composer;
