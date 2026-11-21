import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";

export function AgentGettingReady({
  agent,
  stalled,
}: {
  agent: Agent;
  stalled: boolean;
}) {
  const { t } = useTranslation("shell");
  return (
    <Empty className="border-0" role="status" data-testid="agent-getting-ready">
      <EmptyHeader>
        <EmptyMedia>
          <HoustonAvatar
            color={resolveAgentColor(agent.color)}
            diameter={56}
            running
          />
        </EmptyMedia>
        <EmptyTitle className="text-2xl font-normal tracking-normal">
          {t("agentProvisioning.gettingReadyTitle", { name: agent.name })}
        </EmptyTitle>
        <EmptyDescription className="text-base">
          {stalled
            ? t("agentProvisioning.stillStarting")
            : t("agentProvisioning.gettingReadyBody", { name: agent.name })}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
