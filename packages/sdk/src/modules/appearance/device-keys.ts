import type { KeyValueStore, SdkLogger } from "../../ports";
import {
  DEFAULT_THEME_PREFERENCE,
  parsePaletteId,
  parseThemeMode,
  type ThemePreference,
} from "./model";

export const THEME_KEYS = {
  mode: "theme",
  light: "theme.light",
  dark: "theme.dark",
} as const;

export type ThemeKey = (typeof THEME_KEYS)[keyof typeof THEME_KEYS];

export interface UnusableThemeValue {
  key: ThemeKey;
  raw: string;
}

export interface ThemeReading {
  pref: ThemePreference;
  unusable: readonly UnusableThemeValue[];
}

const FIELD_KEYS = [
  ["mode", THEME_KEYS.mode],
  ["light", THEME_KEYS.light],
  ["dark", THEME_KEYS.dark],
] as const;

type FieldKey = (typeof FIELD_KEYS)[number];

export async function readTheme(
  store: KeyValueStore,
  logger: SdkLogger,
): Promise<ThemeReading> {
  const [mode, light, dark] = await Promise.all([
    store.get(THEME_KEYS.mode),
    store.get(THEME_KEYS.light),
    store.get(THEME_KEYS.dark),
  ]);
  const unusable: UnusableThemeValue[] = [];
  const usable = <T>(
    key: ThemeKey,
    raw: string | null,
    parsed: T | null,
    fallback: T,
  ): T => {
    if (parsed !== null) return parsed;
    if (raw !== null) unusable.push({ key, raw });
    return fallback;
  };
  const pref: ThemePreference = {
    mode: usable(
      THEME_KEYS.mode,
      mode,
      parseThemeMode(mode),
      DEFAULT_THEME_PREFERENCE.mode,
    ),
    light: usable(
      THEME_KEYS.light,
      light,
      parsePaletteId(light, "light"),
      DEFAULT_THEME_PREFERENCE.light,
    ),
    dark: usable(
      THEME_KEYS.dark,
      dark,
      parsePaletteId(dark, "dark"),
      DEFAULT_THEME_PREFERENCE.dark,
    ),
  };
  for (const { key, raw } of unusable) {
    logger.warn(
      "appearance: stored value is not an appearance this build ships",
      {
        key,
        raw,
      },
    );
  }
  return { pref, unusable };
}

async function rollback(
  store: KeyValueStore,
  written: readonly FieldKey[],
  base: ThemePreference,
  logger: SdkLogger,
): Promise<void> {
  for (const [field, key] of written) {
    try {
      await store.set(key, base[field]);
    } catch (err) {
      logger.warn("appearance: a key is left ahead of the saved preference", {
        key,
        saved: base[field],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export async function writeChangedKeys(
  store: KeyValueStore,
  next: ThemePreference,
  base: ThemePreference,
  logger: SdkLogger,
): Promise<void> {
  const written: FieldKey[] = [];
  for (const entry of FIELD_KEYS.filter(([f]) => next[f] !== base[f])) {
    const [field, key] = entry;
    try {
      await store.set(key, next[field]);
    } catch (err) {
      await rollback(store, written, base, logger);
      throw err;
    }
    written.push(entry);
  }
}
