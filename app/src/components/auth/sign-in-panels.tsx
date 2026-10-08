import { useTranslation } from "react-i18next";
import { tauriSystem } from "../../lib/tauri";

/** Open an external URL in the system browser (matches sign-in-screen). */
const openExternal = (url: string) => () => {
  void tauriSystem.openUrl(url);
};

/** The legal footer under the sign-in card (Privacy / Terms). */
export function LegalFooter() {
  const { t } = useTranslation("auth");
  return (
    <div className="flex items-center justify-center gap-3 py-6 text-xs text-ink-muted">
      <button
        type="button"
        onClick={openExternal("https://gethouston.ai/privacy")}
        className="underline-offset-4 hover:text-ink hover:underline"
      >
        {t("legal.privacy")}
      </button>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={openExternal("https://gethouston.ai/terms")}
        className="underline-offset-4 hover:text-ink hover:underline"
      >
        {t("legal.terms")}
      </button>
    </div>
  );
}
