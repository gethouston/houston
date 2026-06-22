import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sun, Moon } from "lucide-react";
import { tauriPreferences } from "../../../lib/tauri";
import { setTheme, type Theme } from "../../../lib/theme";

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

  return (
    <section>
      <h2 className="text-lg font-semibold mb-4">{t("appearance.title")}</h2>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleThemeToggle("light")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition-colors ${
            theme === "light"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-foreground hover:bg-accent"
          }`}
        >
          <Sun className="size-4" />
          {t("appearance.light")}
        </button>
        <button
          type="button"
          onClick={() => handleThemeToggle("dark")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition-colors ${
            theme === "dark"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-foreground hover:bg-accent"
          }`}
        >
          <Moon className="size-4" />
          {t("appearance.dark")}
        </button>
      </div>
    </section>
  );
}
