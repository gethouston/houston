import { useTranslation } from "react-i18next";
import { PRIVACY_URL, TERMS_URL } from "../../lib/legal-urls";
import { tauriSystem } from "../../lib/tauri";

const openExternal = (url: string) => () => {
  void tauriSystem.openUrl(url);
};

const LEGAL_LINK =
  "relative underline-offset-4 hover:text-ink hover:underline after:absolute after:-inset-x-1 after:-inset-y-3.5 md:after:hidden";

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

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-line" />
      <span className="text-xs text-ink-muted">{label}</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}
