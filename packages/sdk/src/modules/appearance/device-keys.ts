/**
 * Where a preference lives on the device, and the read and write over it.
 *
 * Three keys, one per field of a {@link ThemePreference}. The names are the ones
 * every Houston build has written, so an upgrade reads back the appearance the
 * user already picked; the store behind them is whatever the surrounding app
 * gave the {@link KeyValueStore} port for this device.
 */

import type { KeyValueStore, SdkLogger } from "../../ports";
import {
  DEFAULT_THEME_PREFERENCE,
  parsePaletteId,
  parseThemeMode,
  type ThemePreference,
} from "./model";

/** The device keys a preference is stored under, one per field. */
export const THEME_KEYS = {
  mode: "theme",
  light: "theme.light",
  dark: "theme.dark",
} as const;

/** One of the three keys above. */
export type ThemeKey = (typeof THEME_KEYS)[keyof typeof THEME_KEYS];

/** A stored value this build cannot wear, kept with the key that held it. */
export interface UnusableThemeValue {
  key: ThemeKey;
  raw: string;
}

/**
 * What was read: the preference in force, plus every key whose stored value was
 * unusable and therefore fell back to its default.
 *
 * The list is returned rather than swallowed because a preference we cannot read
 * is a bug we want to see: the SDK logs it as a diagnostic, and the surface —
 * which owns the reporting paths — reports it where we will read it.
 */
export interface ThemeReading {
  pref: ThemePreference;
  unusable: readonly UnusableThemeValue[];
}

/** Each field with the key holding it: the order reads and writes agree on. */
const FIELD_KEYS = [
  ["mode", THEME_KEYS.mode],
  ["light", THEME_KEYS.light],
  ["dark", THEME_KEYS.dark],
] as const;

/** One field of a preference beside the device key that holds it. */
type FieldKey = (typeof FIELD_KEYS)[number];

/**
 * Read the three keys and collapse them into a preference. A key that is absent
 * lands on its default silently (a fresh install); a key that HOLDS something
 * this build cannot wear lands on the same default and is named in
 * {@link ThemeReading.unusable}. A store that refuses the read rejects: "unknown"
 * is not "unset", and a caller holding a mirror of its own acts on the
 * difference rather than repainting a guess.
 */
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

/**
 * Put the keys already written back to the preference still saved. Best effort:
 * the store just refused a write, so it may refuse these too, and a key that
 * stays ahead is named rather than swallowed. The original refusal is what the
 * caller hears, so this never throws.
 */
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

/**
 * Write only the keys whose value MOVED, one at a time, and keep them
 * all-or-nothing. A picker that re-sends the whole preference must not rewrite
 * the two fields the user never touched, and `base` is what is already stored,
 * not what is on screen, so a paint that ran ahead of the write cannot make a
 * real change look like a no-op.
 *
 * A pick can move two keys at once (a mode and the palette that mode wears), and
 * the device holds one key per field, so that is two writes. Sending them
 * together would let the store take one and refuse the other: the device would
 * then hold half a choice, and the next boot would paint a mode with the palette
 * of the choice before it. So the keys go out in sequence and a refusal puts the
 * earlier ones back, which is also the invariant every caller diffs against: a
 * rejected write leaves `base` the preference that is saved.
 */
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
