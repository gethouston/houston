import { Switch } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useAgentGrantMutation } from "../../../hooks/queries/use-integrations";
import { AppRow } from "../../integrations";
import type { AgentAppRow } from "./model";

interface AgentUngrantedAppsSectionProps {
  /** Connected + active apps NOT yet granted to this agent. */
  rows: AgentAppRow[];
  /** This agent, for the per-row grant toggle. */
  agentId: string;
  /** Whether the viewer may grant (Switch shown only then). */
  canEdit: boolean;
}

/**
 * Apps connected on the account but not yet turned on for this agent. Instead
 * of hiding them (which left users staring at a connected app they could not
 * find), we show them with an inline toggle: flipping it grants the app to this
 * agent, and the optimistic {@link useAgentGrantMutation} moves the row into
 * `activeRows` so it migrates to the Installed strip reactively. Viewers who
 * cannot edit grants see the plain rows (state stays visible, no toggle).
 * Rendered by the tab only when there is at least one such app.
 */
export function AgentUngrantedAppsSection({
  rows,
  agentId,
  canEdit,
}: AgentUngrantedAppsSectionProps) {
  const { t } = useTranslation("integrations");
  const grant = useAgentGrantMutation(agentId);

  return (
    <section>
      <h2 className="text-sm font-medium text-ink">
        {t("agentTab.offForAgent.heading")}
      </h2>
      <p className="mb-3 mt-0.5 text-xs text-ink-muted">
        {t("agentTab.offForAgent.subtitle")}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(({ connection, app }) => (
          <AppRow
            key={connection.connectionId || connection.toolkit}
            display={app}
            description={app.description}
            trailing={
              canEdit ? (
                <Switch
                  checked={false}
                  aria-label={t("agentTab.offForAgent.turnOn", {
                    app: app.name,
                  })}
                  onCheckedChange={() =>
                    grant.mutate({ toolkit: connection.toolkit, op: "add" })
                  }
                />
              ) : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
