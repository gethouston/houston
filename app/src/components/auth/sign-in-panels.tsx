import { useTranslation } from "react-i18next";
import { PRIVACY_URL, TERMS_URL } from "../../lib/legal-urls";
import { tauriSystem } from "../../lib/tauri";

/** Open an external URL in the system browser (matches sign-in-screen). */
const openExternal = (url: string) => () => {
  void tauriSystem.openUrl(url);
};

// 16px-tall text links; the ::after hit-slop makes each a 44px phone target
// without moving the footer, and stops at md: where a pointer needs none.
const LEGAL_LINK =
  "relative underline-offset-4 hover:text-ink hover:underline after:absolute after:-inset-x-1 after:-inset-y-3.5 md:after:hidden";

/** The legal footer under the sign-in card (Privacy / Terms). */
export function LegalFooter() {
  const { t } = useTranslation("auth");
  return (
    <div className="flex items-center justify-center gap-3 py-6 text-xs text-ink-muted">
      <button
        type="button"
        onClick={openExternal(PRIVACY_URL)}
        className={LEGAL_LINK}
      >
        {t("legal.privacy")}
      </button>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={openExternal(TERMS_URL)}
        className={LEGAL_LINK}
      >
        {t("legal.terms")}
      </button>
    </div>
  );
}

/** A hairline rule with a centered lowercase label ("or", "or use another way"). */
export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-line" />
      <span className="text-xs text-ink-muted">{label}</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}
