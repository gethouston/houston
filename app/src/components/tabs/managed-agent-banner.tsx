import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Read-only notice shown atop an agent's Settings sub-tabs when the current
 * caller is not an agent-manager (matrix v2 configure-scope). Explains why the
 * editing affordances are gone: the org owns the agent and only its managers can
 * reconfigure it. Cosmetic only — the gateway is the real enforcer.
 */
export function ManagedAgentBanner() {
  const { t } = useTranslation("teams");
  return (
    <div className="mx-auto max-w-3xl w-full px-6 pt-4">
      <div className="flex items-center gap-2.5 rounded-xl border border-foreground/5 bg-secondary px-4 py-2.5 text-sm text-muted-foreground">
        <Lock className="size-4 shrink-0" aria-hidden="true" />
        <span>{t("managedAgent.banner")}</span>
      </div>
    </div>
  );
}
