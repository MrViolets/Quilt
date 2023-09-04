"use strict";

import * as ch from "./chrome/promisify.js";

export const defaults = {
  auto_tiling: {
    title: chrome.i18n.getMessage("MENU_ENABLED"),
    value: true,
    type: "checkbox"
  },
  master_window: {
    title: chrome.i18n.getMessage("MENU_MAIN_WINDOW"),
    value: "none",
    type: "radio",
    options: ["start", "end", "none"]
  },
  master_ratio: {
    title: chrome.i18n.getMessage("MENU_MAIN_WINDOW_RATIO"),
    value: "50%",
    type: "radio",
    options: ["33%", "50%", "66%"]
  },
  padding: {
    title: chrome.i18n.getMessage("MENU_PADDING"),
    value: "10",
    type: "radio",
    options: ["10", "20", "30", "none"]
  }
};

export async function get() {
  try {
    const result = await ch.storageLocalGet({ preferences: defaults });
    const userPreferences = result.preferences;

    for (const key in userPreferences) {
      if (!(key in defaults)) {
        delete userPreferences[key];
      }
    }

    for (const defaultKey in defaults) {
      if (!(defaultKey in userPreferences)) {
        userPreferences[defaultKey] = defaults[defaultKey];
      }
    }

    return userPreferences;
  } catch (error) {
    console.error(error);
    return defaults;
  }
}
