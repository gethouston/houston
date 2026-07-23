import { useTranslation } from "react-i18next";
import { tauriSystem } from "../../lib/tauri";

/** Open an external URL in the system browser (matches sign-in-screen). */
const openExternal = (url: string) => () => {
  void tauriSystem.openUrl(url);
};

/** The sign-in card's right-hand referral pitch panel. */
export function ReferralPanel() {
  const { t } = useTranslation("auth");
  return (
    <div className="flex flex-col justify-between gap-6 bg-action p-8 text-action-text sm:col-span-1">
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t("referral.title")}</h2>
        <p className="text-sm text-action-text/70">{t("referral.body")}</p>
      </div>
      <span className="inline-flex items-center self-start rounded-full border border-action-text/30 px-3 py-1 text-xs font-medium text-action-text/80">
        {t("referral.comingSoon")}
      </span>
    </div>
  );
}

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
