import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../../lib/analytics";
import {
  changeLocale,
  isSupported,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "../../../lib/i18n";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { SettingsControlRow } from "../settings-row";

const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
};

export function LanguageSection() {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const addToast = useUIStore((s) => s.addToast);
  const current = useWorkspaceStore((s) => s.current);
  const setWorkspaceLocale = useWorkspaceStore((s) => s.setLocale);
  const currentLocale: SupportedLocale = isSupported(i18n.resolvedLanguage)
    ? (i18n.resolvedLanguage as SupportedLocale)
    : "en";

  const handleLocaleChange = async (value: string) => {
    // Persist the workspace override FIRST so the engine is the source of truth;
    // if it fails the error surfaces and the UI never switches to an unsaved
    // language. `current` is guaranteed once a workspace is active; the guard
    // just defends the rare unmount race.
    if (!isSupported(value) || !current) return;
    await setWorkspaceLocale(current.id, value);
    await changeLocale(value);
    analytics.track("language_changed", { locale: value });
    addToast({ title: t("common:language.toastChanged") });
  };

  return (
    <SettingsControlRow icon={Languages} title={t("settings:nav.language")}>
      <Select value={currentLocale} onValueChange={handleLocaleChange}>
        <SelectTrigger
          aria-label={t("settings:nav.language")}
          className="w-40 rounded-lg"
        >
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
    </SettingsControlRow>
  );
}
