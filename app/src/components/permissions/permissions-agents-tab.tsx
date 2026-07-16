import type { OrgMember } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { AgentsList } from "./agents-list";
import { DefaultsIntegrations } from "./defaults-integrations";
import { DefaultsModels } from "./defaults-models";

/**
 * Permissions > Agents: first the workspace-wide "Defaults for every agent" card
 * (the org app + model ceilings every agent inherits — owner-editable, admin
 * read-only), then the agent list. Each agent drills into its per-agent card
 * ({@link AgentDetail}), where a manager narrows that one agent's ceilings.
 *
 * The view already gates to multiplayer owner/admin, so this never mounts in
 * single-player or for a plain member.
 */
export function PermissionsAgentsTab({
  isOwner,
  members,
  onOpenAgent,
}: {
  isOwner: boolean;
  members: OrgMember[];
  onOpenAgent: (agent: Agent) => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-sm font-medium text-ink">
          {t("permissions.defaults.title")}
        </h2>
        <p className="mt-1 mb-5 text-sm text-ink-muted">
          {t("permissions.defaults.subtitle")}
        </p>
        <div className="space-y-8">
          <DefaultsIntegrations isOwner={isOwner} />
          <DefaultsModels isOwner={isOwner} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-ink">
          {t("permissions.agents.listTitle")}
        </h2>
        <AgentsList members={members} onOpenAgent={onOpenAgent} />
      </section>
    </div>
  );
}
