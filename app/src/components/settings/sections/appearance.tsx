import { Moon, Palette, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { tauriPreferences } from "../../../lib/tauri";
import { setTheme, type Theme } from "../../../lib/theme";
import { SettingsControlRow } from "../settings-row";

export function AppearanceSection() {
  const { t } = useTranslation("settings");
  const [theme, setCurrentTheme] = useState<Theme>("light");

  useEffect(() => {
    tauriPreferences
      .get("theme")
      .then((v) => {
        if (v === "dark") setCurrentTheme("dark");
      })
      .catch(() => {});
  }, []);

  const handleThemeToggle = async (value: Theme) => {
    setCurrentTheme(value);
    await setTheme(value);
  };

  const pill = (value: Theme) =>
    `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
      theme === value
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <SettingsControlRow icon={Palette} title={t("appearance.title")}>
      <div className="flex items-center gap-1 rounded-full bg-secondary p-0.5">
        <button
          type="button"
          onClick={() => handleThemeToggle("light")}
          className={pill("light")}
        >
          <Sun className="size-4" />
          {t("appearance.light")}
        </button>
        <button
          type="button"
          onClick={() => handleThemeToggle("dark")}
          className={pill("dark")}
        >
          <Moon className="size-4" />
          {t("appearance.dark")}
        </button>
      </div>
    </SettingsControlRow>
  );
}
