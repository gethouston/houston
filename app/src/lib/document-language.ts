import type { i18n as I18n } from "i18next";

/**
 * Mirror the active locale onto `<html lang>`. index.html ships `lang="en"`
 * for the pre-JS frame; once i18n resolves the real locale the document has
 * to say so. Screen readers pick pronunciation from it, and browsers read it
 * as the page-language hint: a Spanish screen labelled English is exactly
 * what invites a translation prompt on a page that opts out of translation.
 * Bind BEFORE `init()` so the initial language lands too, not only later
 * changes.
 */
export function bindDocumentLanguage(i18n: I18n): void {
  if (typeof document === "undefined") return;
  const apply = (lng: string | undefined) => {
    if (lng) document.documentElement.lang = lng;
  };
  i18n.on("languageChanged", apply);
  apply(i18n.language);
}
