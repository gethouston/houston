import type { ThemePreference, ThemeReading } from "@houston/sdk";
import type { BaseCtor } from "./mixin";

/**
 * The device's appearance — the theme mode and the palette each mode wears —
 * bound from `@houston/sdk`.
 *
 * NO `viaSdk` and no path, unlike every other cluster: the appearance is read and
 * written in this device's own preference store (`./device-prefs`), so there is
 * no response to translate a status off and no per-agent pod whose wake a landing
 * request would end. Those two things are the whole of what `viaSdk` does, and
 * handing it a path no request uses would invent an address for the catalog to
 * publish. A store that refuses still rejects, which is what the caller acts on.
 */
export function AppearanceMixin<TBase extends BaseCtor>(Base: TBase) {
  class Appearance extends Base {
    getThemePreference(): Promise<ThemeReading> {
      return this.ctx.sdk.appearance.getTheme();
    }
    /** `previous` is the preference already SAVED, so a surface that painted
     *  ahead of the write still diffs against what is stored. */
    setThemePreference(
      patch: Partial<ThemePreference>,
      previous?: ThemePreference,
    ): Promise<ThemePreference> {
      return this.ctx.sdk.appearance.setTheme(patch, previous);
    }
  }
  return Appearance;
}
