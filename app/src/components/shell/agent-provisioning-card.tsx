/**
 * In-chat card while a just-created agent's engine is still warming up
 * (HOU-693). Rendered in the chat's `afterMessages` slot, so it appears
 * right under the message the user already sent: the send is held by the
 * platform until the engine is up, so the message is safe — this card says
 * so instead of leaving a bare loading indicator for minutes. The readiness
 * probe clears the store entry, which unmounts the card, and the held reply
 * then streams in normally.
 */

import { HoustonAvatar } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useAgentProvisioningStore } from "../../stores/agent-provisioning";
import { RowCard } from "../cards/row-card";

export function AgentProvisioningCard({ agentId }: { agentId: string }) {
  const { t } = useTranslation("shell");
  const active = useAgentProvisioningStore((s) =>
    Boolean(s.provisioning[agentId]),
  );
  if (!active) return null;
  return (
    <div className="w-full px-1 py-2" role="status">
      <RowCard
        media={<HoustonAvatar diameter={30} running />}
        title={t("agentProvisioning.title")}
        description={t("agentProvisioning.chatBody")}
      />
    </div>
  );
}
