import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import { Palette } from "lucide-react";
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
  parseThemeMode,
  type ResolvedMode,
  type ThemePreference,
} from "../../../lib/theme-model";
import { useIsDarkTheme } from "../../../lib/use-is-dark-theme";
import { SettingsControlRow } from "../settings-row";
import { MODE_LABEL_KEY, MODE_ORDER, summaryParts } from "./appearance-model";
import { PalettesDialog } from "./appearance-palettes";

/**
 * Appearance: ONE row for the whole look of the app.
 *
 * The mode is the choice people make daily, so it sits in the row as a menu; the
 * palette each mode wears is a choice made once, so it lives behind Customize
 * (`./appearance-palettes`). The row's own description is the current state in
 * words, which is what makes a collapsed control honest: the mode, plus the
 * palette each mode wears.
 */

export function AppearanceSection() {
  const { t } = useTranslation("settings");
  const [pref, setPref] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [palettesOpen, setPalettesOpen] = useState(false);
  // The mode ON SCREEN, which is what `system` makes ambiguous: it follows the
  // OS live, so only the painted attribute knows which section is in force.
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

  const summary = summaryParts(pref);

  return (
    <>
      <SettingsControlRow
        icon={Palette}
        title={t("appearance.title")}
        description={t("appearance.summary", {
          mode: t(summary.modeKey),
          light: summary.light,
          dark: summary.dark,
        })}
        stack
      >
        <div className="flex items-center gap-2">
          <Select
            value={pref.mode}
            // The menu only ever emits the three values below; parsing rather
            // than casting keeps that a fact the types check.
            onValueChange={(value) => {
              const mode = parseThemeMode(value);
              if (mode) commit({ mode });
            }}
          >
            {/* `min-h-11` is the phone thumb target; the desktop control keeps
                the 36px height every other settings menu wears. */}
            <SelectTrigger
              aria-label={t("appearance.title")}
              className="min-h-11 flex-1 rounded-lg md:min-h-9 md:w-40 md:flex-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODE_ORDER.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(MODE_LABEL_KEY[mode])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="min-h-11 md:min-h-9"
            onClick={() => setPalettesOpen(true)}
          >
            {t("appearance.customize")}
          </Button>
        </div>
      </SettingsControlRow>
      <PalettesDialog
        open={palettesOpen}
        onOpenChange={setPalettesOpen}
        pref={pref}
        resolved={resolved}
        onPick={(mode, id) =>
          commit(mode === "dark" ? { dark: id } : { light: id })
        }
      />
    </>
  );
}
