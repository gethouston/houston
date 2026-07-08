import { useTranslation } from "react-i18next";
import { AppRow, accountDisplayLabel } from "../../integrations";
import type { AgentAppRow as AgentAppRowVM } from "./model";

interface AgentAccountAppsSectionProps {
  /** Connected-but-not-granted, active accounts (grants mode + editor only). */
  rows: AgentAppRowVM[];
  /** Grant this already-connected account to this agent (no OAuth). */
  onActivate: (connectionId: string) => void;
}

/**
 * Section 2: apps connected to the user's account but not yet granted to THIS
 * agent, each a one-click "Activate for this agent" (grant-add, no OAuth).
 * Promoted out of the old picker so a user can scan and hand an already-connected
 * app to this agent without reconnecting. The caller renders it only in grants
 * mode, only when the user can edit, and only when there is something to
 * activate (hidden if empty).
 */
export function AgentAccountAppsSection({
  rows,
  onActivate,
}: AgentAccountAppsSectionProps) {
  const { t } = useTranslation("integrations");

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-medium text-foreground">
        {t("agentTab.accountTitle")}
      </h2>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(({ connection, app, showAccountLabel }) => (
          <AppRow
            key={connection.connectionId}
            display={app}
            description={
              showAccountLabel
                ? accountDisplayLabel(connection, t("account.unnamed"))
                : app.description
            }
            trailing={
              <button
                type="button"
                onClick={() => onActivate(connection.connectionId)}
                className="inline-flex h-7 shrink-0 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("agentTab.activate")}
              </button>
            }
          />
        ))}
      </div>
    </section>
  );
}
