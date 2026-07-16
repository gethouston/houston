import { useOrg } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import type { TabProps } from "../../lib/types";
import { AgentPermissionsPanel } from "../permissions/agent-permissions-panel";
import { PageContainer } from "../shell/page-shell";

/**
 * The agent workspace's **Permissions** tab: the SAME People | Integrations | AI
 * Models surface the top-level Permissions view shows per agent, but mounted ON
 * the agent so it is visible to EVERYONE who can open it. Managers get the fully
 * editable panel right here; a non-manager (a plain member, or an admin who
 * doesn't manage this agent) gets it `readOnly` — states visible, no controls —
 * so a user always sees WHY their agent can or can't use something.
 *
 * The tab itself is `teams`-gated in `visibleAgentTabs`, so it never mounts on a
 * single-player/self-host deployment (no ceilings, no roster). The roster comes
 * from `useOrg`; the gateway serves it only to owner/admin, so a plain member's
 * `members` arrives empty and the People tab degrades to a viewer line. The
 * gateway is the sole enforcer; `readOnly` only avoids a dead affordance.
 */
export function AgentPermissionsTab({ agent }: TabProps) {
  const { capabilities } = useCapabilities();
  const teams = capabilities?.teams === true;
  const { data: org } = useOrg(teams);
  const readOnly = !isAgentManager(capabilities, agent);

  return (
    <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <PageContainer className="py-8">
        <AgentPermissionsPanel
          agent={agent}
          members={org?.members ?? []}
          readOnly={readOnly}
        />
      </PageContainer>
    </div>
  );
}

export default AgentPermissionsTab;
