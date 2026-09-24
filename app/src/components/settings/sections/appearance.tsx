import {
  parseThemeMode,
  type ResolvedMode,
  type ThemePreference,
} from "@houston/sdk/appearance";
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
  currentThemePreference,
  persistThemePreference,
  themeReady,
} from "../../../lib/theme";
import { useIsDarkTheme } from "../../../lib/use-is-dark-theme";
import { SettingsControlRow } from "../settings-row";
import {
  type AppearanceCommitter,
  createAppearanceCommitter,
} from "./appearance-commit";
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
  // What the row SHOWS: the preference in force, read synchronously so the row
  // opens on the picks the app is already wearing. Reading it from the engine
  // again here would apply it a second time, rewrite the device mirror and
  // re-release the native window, so the row never re-reads.
  const [pref, setPref] = useState<ThemePreference>(currentThemePreference);
  // What the row WRITES through, and the reason the controls open closed: the
  // committer diffs every write against the preference already SAVED, so it can
  // only be built once the boot read has said what that is. Seeding it from the
  // defaults while that read is still in flight (a cold engine makes it a real
  // wait) would persist a combination nobody chose over the real picks. A read
  // that FAILED never opens the controls at all: what is saved stays unknown,
  // and `loadThemePreference` has already reported it.
  const [committer, setCommitter] = useState<AppearanceCommitter | null>(null);
  useEffect(() => {
    let built: AppearanceCommitter | null = null;
    let live = true;
    void themeReady().then((saved) => {
      if (!live || saved === null) return;
      setPref(saved);
      built = createAppearanceCommitter(saved, setPref, {
        apply: applyThemePreference,
        persist: persistThemePreference,
        report: logAndReportError,
      });
      setCommitter(built);
    });
    // Closing Settings mid-burst must not drop the last pick: disposing stores
    // what is painted at once instead of waiting out a delay nobody is left to
    // interrupt, and stops the committer touching a row that is gone. A reload
    // or quit runs no React cleanup, so the page's own unload is the second
    // trigger for the same flush.
    const flush = () => built?.dispose();
    window.addEventListener("pagehide", flush);
    return () => {
      live = false;
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  const [palettesOpen, setPalettesOpen] = useState(false);
  // The mode ON SCREEN, which is what `system` makes ambiguous: it follows the
  // OS live, so only the painted attribute knows which section is in force.
  const resolved: ResolvedMode = useIsDarkTheme() ? "dark" : "light";

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
            disabled={committer === null}
            // The menu only ever emits the three values below; parsing rather
            // than casting keeps that a fact the types check.
            onValueChange={(value) => {
              const mode = parseThemeMode(value);
              if (mode) committer?.commit({ mode });
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
            disabled={committer === null}
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
          committer?.commit(mode === "dark" ? { dark: id } : { light: id })
        }
      />
    </>
  );
}
