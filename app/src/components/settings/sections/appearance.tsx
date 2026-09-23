import { Moon, Palette, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { logAndReportError } from "../../../lib/error-report";
import { loadThemePreference, setThemePreference } from "../../../lib/theme";
import {
  DEFAULT_THEME_PREFERENCE,
  type ThemeMode,
} from "../../../lib/theme-model";
import { SettingsControlRow } from "../settings-row";

export function AppearanceSection() {
  const { t } = useTranslation("settings");
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME_PREFERENCE.mode);

  useEffect(() => {
    void loadThemePreference().then((pref) => {
      if (pref) setMode(pref.mode);
    });
  }, []);

  const handleModeToggle = async (value: ThemeMode) => {
    setMode(value);
    try {
      await setThemePreference({ mode: value });
    } catch (err) {
      logAndReportError("set_theme_preference", err);
    }
  };

  const pill = (value: ThemeMode) =>
    `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
      mode === value
        ? "bg-action text-action-text"
        : "text-ink-muted hover:text-ink"
    }`;

  return (
    <SettingsControlRow icon={Palette} title={t("appearance.title")}>
      <div className="flex items-center gap-1 rounded-full bg-chip p-0.5">
        <button
          type="button"
          onClick={() => void handleModeToggle("light")}
          className={pill("light")}
        >
          <Sun className="size-4" />
          {t("appearance.light")}
        </button>
        <button
          type="button"
          onClick={() => void handleModeToggle("dark")}
          className={pill("dark")}
        >
          <Moon className="size-4" />
          {t("appearance.dark")}
        </button>
      </div>
    </SettingsControlRow>
  );
}
