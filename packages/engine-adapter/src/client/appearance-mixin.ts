import type { ThemePreference, ThemeReading } from "@houston/sdk";
import type { BaseCtor } from "./mixin";

export function AppearanceMixin<TBase extends BaseCtor>(Base: TBase) {
  class Appearance extends Base {
    getThemePreference(): Promise<ThemeReading> {
      return this.ctx.sdk.appearance.getTheme();
    }
    setThemePreference(
      patch: Partial<ThemePreference>,
      previous?: ThemePreference,
    ): Promise<ThemePreference> {
      return this.ctx.sdk.appearance.setTheme(patch, previous);
    }
  }
  return Appearance;
}
