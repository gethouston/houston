import type { i18n as I18n } from "i18next";

export function bindDocumentLanguage(i18n: I18n): void {
  if (typeof document === "undefined") return;
  const apply = (lng: string | undefined) => {
    if (lng) document.documentElement.lang = lng;
  };
  i18n.on("languageChanged", apply);
  apply(i18n.language);
}
