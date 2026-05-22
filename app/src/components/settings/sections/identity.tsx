import { useTranslation } from "react-i18next";

/**
 * Settings → Identity. Renders the user's Beltic-issued user credential
 * (status, trust level, issued/expires, credential id) and the actions
 * to (re-)verify or revoke it.
 *
 * For chunk 5 the workspace-level identity routes aren't wired through
 * the engine yet — chunk 3 only built the agent_authorization surface.
 * So this section renders the unverified empty state. A follow-up adds
 * the workspace identity route + connects the verify CTA to it.
 */
export function IdentitySection() {
  const { t } = useTranslation("settings");

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold mb-1">{t("identity.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("identity.subtitle")}</p>
      </header>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">
            {t("identity.emptyTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("identity.emptyDescription")}
          </p>
        </div>

        <button
          type="button"
          className="rounded-full bg-gray-950 px-3 h-9 text-sm font-medium text-white hover:bg-gray-800"
          disabled
          title="Verify flow lands in a follow-up commit"
        >
          {t("identity.verifyCta")}
        </button>
      </div>
    </section>
  );
}
