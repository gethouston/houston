import {
  DEFAULT_THEME_PREFERENCE,
  followsSystem,
  type ResolvedMode,
  type ResolvedTheme,
  resolveTheme,
  type ThemePreference,
} from "@houston/sdk/appearance";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { logAndReportError } from "./error-report";
import {
  applyThemeAttribute,
  startSystemThemeSync,
  systemPrefersDark,
  systemPrefersDarkAfterRelease,
  writeCachedTheme,
} from "./theme-boot";
import { serializeNativeTheme } from "./theme-native";

const setNativeTheme = serializeNativeTheme((theme) =>
  getCurrentWindow().setTheme(theme),
);

let current: ThemePreference = DEFAULT_THEME_PREFERENCE;
let watching = false;

export function currentThemePreference(): ThemePreference {
  return current;
}

function paintTheme(
  pref: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  const resolved = resolveTheme(pref, prefersDark);
  applyThemeAttribute(resolved);
  writeCachedTheme(resolved);
  return resolved;
}

function pinWindowChrome(mode: ResolvedMode): void {
  void setNativeTheme(mode).catch((err: unknown) => {
    logAndReportError("sync_window_theme", err);
  });
}

async function followOsAppearance(pref: ThemePreference): Promise<void> {
  let prefersDark: boolean;
  try {
    prefersDark = await systemPrefersDarkAfterRelease(() =>
      setNativeTheme(null),
    );
  } catch (err) {
    logAndReportError("release_window_theme", err);
    return;
  }
  if (current === pref) paintTheme(pref, prefersDark);
}

export function applyThemePreference(pref: ThemePreference): ResolvedTheme {
  current = pref;
  const resolved = paintTheme(pref, systemPrefersDark());
  if (followsSystem(pref)) {
    void followOsAppearance(pref);
  } else {
    pinWindowChrome(resolved.mode);
  }
  if (!watching) {
    watching = true;
    startSystemThemeSync(
      () => current,
      (live) => {
        applyThemePreference(live);
      },
    );
  }
  return resolved;
}
