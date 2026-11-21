import type { ThemeReading } from "@houston/sdk";
import type { ThemePreference } from "@houston/sdk/appearance";
import { getEngine } from "./engine";
import { engineCall } from "./tauri";

export const tauriTheme = {
  get: () =>
    engineCall<ThemeReading>(
      "get_theme_preference",
      () => getEngine().getThemePreference(),
      undefined,
      { toast: false, capture: false },
    ),
  set: (patch: Partial<ThemePreference>, previous: ThemePreference) =>
    engineCall<ThemePreference>(
      "set_theme_preference",
      () => getEngine().setThemePreference(patch, previous),
      undefined,
      { toast: false, capture: false },
    ),
};
