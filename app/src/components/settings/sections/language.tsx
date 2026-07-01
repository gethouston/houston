import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  changeLocale,
  isSupported,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "../../../lib/i18n";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
};

export function LanguageSection() {
  const { t, i18n } = useTranslation("common");
  const addToast = useUIStore((s) => s.addToast);
  const current = useWorkspaceStore((s) => s.current);
  const setWorkspaceLocale = useWorkspaceStore((s) => s.setLocale);
  const currentLocale: SupportedLocale = isSupported(i18n.resolvedLanguage)
    ? (i18n.resolvedLanguage as SupportedLocale)
    : "en";

  const handleLocaleChange = async (value: string) => {
    // This picker lives under the Workspace settings tab, which SettingsView
    // only renders once a workspace is active — so `current` is guaranteed; the
    // guard just defends the rare unmount race. Persist the override FIRST so
    // the engine is the source of truth; if it fails the error surfaces and the
    // UI never switches to an unsaved language.
    if (!isSupported(value) || !current) return;
    await setWorkspaceLocale(current.id, value);
    await changeLocale(value);
    addToast({ title: t("language.toastChanged") });
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("language.title")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("language.description")}
      </p>
      <div>
        <label
          htmlFor="language-select"
          className="text-xs text-muted-foreground block mb-1.5"
        >
          {t("language.label")}
        </label>
        <Select value={currentLocale} onValueChange={handleLocaleChange}>
          <SelectTrigger id="language-select" className="w-full rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LOCALES.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {LOCALE_LABELS[loc]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}
