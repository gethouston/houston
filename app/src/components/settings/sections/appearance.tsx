import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { logAndReportError } from "../../../lib/error-report";
import {
  applyThemePreference,
  loadThemePreference,
  setThemePreference,
} from "../../../lib/theme";
import {
  DEFAULT_THEME_PREFERENCE,
  type ResolvedMode,
  type ThemePreference,
} from "../../../lib/theme-model";
import { useIsDarkTheme } from "../../../lib/use-is-dark-theme";
import { SettingsControlRow } from "../settings-row";
import { chosenPalette, isRowDimmed } from "./appearance-model";
import { PaletteRow } from "./appearance-swatches";

/**
 * Appearance: the mode the app runs in, plus the palette each mode wears.
 *
 * Three rows of one card, because they are three independent choices (see
 * `lib/theme-model`): the mode, the light palette and the dark palette. Picking
 * the palette of the mode you are NOT in is deliberate and silent — it shows the
 * next time that mode resolves — so its row dims rather than disappearing.
 */

/** The segments of the mode control, in the order they read. */
const MODES = [
  { value: "light", Icon: Sun, label: "appearance.light" },
  { value: "dark", Icon: Moon, label: "appearance.dark" },
  { value: "system", Icon: Monitor, label: "appearance.system" },
] as const;

/** Phone targets clear 44px; `md:` keeps the desktop pill exactly as it was. */
const SEGMENT =
  "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-3 text-sm transition-colors md:flex-none md:py-1.5";

export function AppearanceSection() {
  const { t } = useTranslation("settings");
  const [pref, setPref] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  // The mode ON SCREEN, which is what `system` makes ambiguous: it follows the
  // OS live, so only the painted attribute knows which palette row is in force.
  const resolved: ResolvedMode = useIsDarkTheme() ? "dark" : "light";

  useEffect(() => {
    void loadThemePreference().then((saved) => {
      if (saved) setPref(saved);
    });
  }, []);

  /**
   * Optimistic: the pick paints and the control moves at once. A failed write
   * reverts both — the engine still holds the previous choice, so leaving the
   * new colours up would show a preference nobody saved. `applyThemePreference`
   * repaints without writing, so the revert cannot fail in turn.
   */
  const commit = (patch: Partial<ThemePreference>) => {
    const previous = pref;
    setPref({ ...previous, ...patch });
    void setThemePreference(patch).catch((err: unknown) => {
      logAndReportError("set_theme_preference", err);
      setPref(previous);
      applyThemePreference(previous);
    });
  };

  return (
    <>
      <SettingsControlRow
        icon={Palette}
        title={t("appearance.title")}
        description={t("appearance.paletteHint")}
        stack
      >
        <fieldset className="flex items-center gap-1 rounded-full bg-chip p-0.5">
          <legend className="sr-only">{t("appearance.title")}</legend>
          {MODES.map(({ value, Icon, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={pref.mode === value}
              onClick={() => commit({ mode: value })}
              className={`${SEGMENT} ${
                pref.mode === value
                  ? "bg-action text-action-text"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              <Icon className="size-4" />
              {t(label)}
            </button>
          ))}
        </fieldset>
      </SettingsControlRow>
      <SettingsControlRow icon={Sun} title={t("appearance.lightPalette")} stack>
        <PaletteRow
          mode="light"
          label={t("appearance.lightPalette")}
          selected={chosenPalette(pref, "light")}
          dimmed={isRowDimmed(resolved, "light")}
          onSelect={(light) => commit({ light })}
        />
      </SettingsControlRow>
      <SettingsControlRow icon={Moon} title={t("appearance.darkPalette")} stack>
        <PaletteRow
          mode="dark"
          label={t("appearance.darkPalette")}
          selected={chosenPalette(pref, "dark")}
          dimmed={isRowDimmed(resolved, "dark")}
          onSelect={(dark) => commit({ dark })}
        />
      </SettingsControlRow>
    </>
  );
}
