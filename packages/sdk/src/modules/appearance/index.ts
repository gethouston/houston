/**
 * The appearance module — the mode the app runs in and the palette each mode
 * wears, for THIS device.
 *
 * Device-local by design, so there is no route and no wire test: a person picks
 * dark on the laptop they read at night and light on the desk they work at, and
 * an appearance that followed the account would fight that. The three keys
 * (`./device-keys`) are read and written through the `devicePreferences` port,
 * which the surrounding app backs with this device's own preference store —
 * never the user-scoped gateway routes the preferences module talks to.
 *
 * TYPED, not a pair of key/value calls: the vocabulary, the mode-mismatch rule
 * and the diff-only write are the contract, and they live here once so every
 * surface — desktop, web, and any surface after them — gets the same answers off
 * the same code instead of re-deriving them beside its own picker.
 *
 * NOT an assistant capability, and it cannot be one: the AI Manager's catalog is
 * derived from the requests an operation issues (`scripts/assistant-catalog/`),
 * and the manager itself runs in the engine pod, where this device's preference
 * store does not exist. A coordinator cannot reach the appearance of a screen it
 * is not sitting at, whatever the catalog said. The person changes it in Settings;
 * handing them there is a hands-on card's job (`request_hands_on`), never a route.
 */

import type { ModuleContext } from "../../module-context";
import { readTheme, type ThemeReading, writeChangedKeys } from "./device-keys";
import { listPalettes, type Palette, type ThemePreference } from "./model";
import { patchFromPayload, validatePatch } from "./validate";

/** The write vocabulary — the same constants back the facade and `dispatch`. */
export const AppearanceCommand = {
  GetTheme: "appearance/getTheme",
  SetTheme: "appearance/setTheme",
} as const;

export type AppearanceCommandType =
  (typeof AppearanceCommand)[keyof typeof AppearanceCommand];

/** The typed facade for the appearance of this device. */
export interface AppearanceModule {
  /** The preference in force, with any unusable stored value named. */
  getTheme(): Promise<ThemeReading>;
  /**
   * Change part of the preference. `previous` is the preference already SAVED —
   * pass it when the surface has painted ahead of the write (a debounced picker)
   * so the diff is taken against what is stored, not against what is on screen.
   */
  setTheme(
    patch: Partial<ThemePreference>,
    previous?: ThemePreference,
  ): Promise<ThemePreference>;
  /** Every palette this build ships, in the order a picker paints them. */
  listPalettes(): readonly Palette[];
}

export function createAppearanceModule(ctx: ModuleContext): AppearanceModule {
  const { devicePreferences, logger } = ctx.config.ports;

  /** Reads the appearance: light, dark or system, and the palette for each mode. */
  const getTheme = (): Promise<ThemeReading> =>
    readTheme(devicePreferences, logger);

  /**
   * Changes the appearance mode or a palette pick; reversible, the Settings row
   * does the same.
   * @param patch The fields to change: the mode, the palette light mode wears,
   *   the one dark mode wears, or any combination. What is left out keeps the
   *   value it already has.
   */
  const setTheme = async (
    patch: Partial<ThemePreference>,
    previous?: ThemePreference,
  ): Promise<ThemePreference> => {
    validatePatch(patch);
    const base = previous ?? (await getTheme()).pref;
    const next: ThemePreference = { ...base, ...patch };
    await writeChangedKeys(devicePreferences, next, base, logger);
    return next;
  };

  ctx.registerCommand(AppearanceCommand.GetTheme, () => getTheme());
  // The dispatched write takes the patch ALONE: a caller across a serialization
  // boundary has painted nothing, so the diff is taken against what is stored.
  ctx.registerCommand(AppearanceCommand.SetTheme, (p) =>
    setTheme(patchFromPayload(p)),
  );

  return { getTheme, setTheme, listPalettes };
}
