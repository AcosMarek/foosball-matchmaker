import { useCallback, useState } from "react";

// Light or dark. By default the app follows the device; a player can pin either one, and
// that choice is remembered on the device. The colours themselves live in ui.tsx; all
// this does is set (or clear) the data-theme attribute that picks between them.
//
// index.html applies a remembered choice before the app loads, so a pinned theme doesn't
// flash the other one first. The storage key and attribute there must match these.

export type ThemeChoice = "system" | "light" | "dark";

const STORAGE_KEY = "foosball:theme";

export const readThemeChoice = (): ThemeChoice => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // Storage unavailable (e.g. private browsing): follow the device.
    return "system";
  }
};

export const applyThemeChoice = (choice: ThemeChoice): void => {
  if (choice === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = choice;
  }
};

export const useThemeChoice = (): [ThemeChoice, (choice: ThemeChoice) => void] => {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);

  const choose = useCallback((next: ThemeChoice) => {
    setChoice(next);
    applyThemeChoice(next);
    try {
      if (next === "system") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // The choice still holds for this visit.
    }
  }, []);

  return [choice, choose];
};
