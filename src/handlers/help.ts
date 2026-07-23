import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

const HELP =
  "CalorieMate helps you track daily calories.\n\n" +
  "• Start Tracking — log a meal (manual, food database, or photo)\n" +
  "• Today's Log — see what you've eaten and what's left\n" +
  "• Edit Entry — change or remove a log line\n" +
  "• Export CSV — download your history\n" +
  "• Reminders — meal prompts and a daily summary\n" +
  "• Settings — target, timezone, profile\n\n" +
  "Tap /start anytime to open the menu. Send a meal photo for an experimental estimate.";

const backToMenu = inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);

composer.command("help", async (ctx) => {
  await ctx.reply(HELP);
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HELP, { reply_markup: backToMenu });
});

export default composer;
