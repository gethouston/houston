import type { ModuleContext } from "../../module-context";
import { readTheme, type ThemeReading, writeChangedKeys } from "./device-keys";
import { listPalettes, type Palette, type ThemePreference } from "./model";
import { patchFromPayload, validatePatch } from "./validate";

export const AppearanceCommand = {
  GetTheme: "appearance/getTheme",
  SetTheme: "appearance/setTheme",
} as const;

export type AppearanceCommandType =
  (typeof AppearanceCommand)[keyof typeof AppearanceCommand];

export interface AppearanceModule {
  getTheme(): Promise<ThemeReading>;
  setTheme(
    patch: Partial<ThemePreference>,
    previous?: ThemePreference,
  ): Promise<ThemePreference>;
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
