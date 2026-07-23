import {
  inlineButton,
  inlineKeyboard,
  mainMenuKeyboard,
  type InlineKeyboardMarkup,
} from "../toolkit/index.js";

export function backMenuKeyboard(): InlineKeyboardMarkup {
  return inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);
}

export function mainOrBack(): InlineKeyboardMarkup {
  return mainMenuKeyboard();
}

export { inlineButton, inlineKeyboard, mainMenuKeyboard };
