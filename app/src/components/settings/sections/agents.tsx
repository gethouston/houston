import { useTranslation } from "react-i18next";
import { useAgentStore } from "../../../stores/agents";
import { AgentCredentialsRow } from "./agents-row";

/**
 * Settings → Authorized agents. Lists every agent in the current
 * workspace plus its Beltic `agent_authorization` credential status,
 * delegation chain (the user credential that authorized it), and a
 * revoke action.
 *
 * Each row fetches its own credentials list via TanStack Query. The WS
 * event invalidator (chunk 4) auto-refreshes when the engine emits
 * CredentialIssued/Revoked/Suspended.
 */
export function AgentsSection() {
  const { t } = useTranslation("settings");
  const agents = useAgentStore((s) => s.agents);

  if (agents.length === 0) {
    return (
      <section className="space-y-6">
        <header>
          <h2 className="text-lg font-semibold mb-1">{t("agents.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("agents.subtitle")}</p>
        </header>
        <div className="rounded-xl border border-border bg-card p-6 space-y-1 text-sm">
          <h3 className="text-base font-semibold">{t("agents.emptyTitle")}</h3>
          <p className="text-muted-foreground">{t("agents.emptyDescription")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold mb-1">{t("agents.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("agents.subtitle")}</p>
      </header>

      <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
        {agents.map((agent) => (
          <AgentCredentialsRow
            key={agent.id}
            agentId={agent.id}
            agentName={agent.name}
            agentPath={agent.folderPath}
          />
        ))}
      </ul>
    </section>
  );
}
