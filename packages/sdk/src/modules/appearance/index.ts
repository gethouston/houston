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

  const getTheme = (): Promise<ThemeReading> =>
    readTheme(devicePreferences, logger);

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
  ctx.registerCommand(AppearanceCommand.SetTheme, (p) =>
    setTheme(patchFromPayload(p)),
  );

  return { getTheme, setTheme, listPalettes };
}
