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

export function AppearanceSection() {
  const { t } = useTranslation("settings");
  const [pref, setPref] = useState<ThemePreference>(currentThemePreference);
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
    const flush = () => built?.dispose();
    window.addEventListener("pagehide", flush);
    return () => {
      live = false;
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  const [palettesOpen, setPalettesOpen] = useState(false);
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
            onValueChange={(value) => {
              const mode = parseThemeMode(value);
              if (mode) committer?.commit({ mode });
            }}
          >
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
