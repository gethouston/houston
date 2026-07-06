import { Spinner } from "@houston-ai/core";
import { Suspense } from "react";
import { DEFAULT_TAB_ID, STANDARD_TABS } from "../../agents/standard-tabs";
import { resolveTabComponent } from "../../agents/tab-resolver";
import type { Agent, AgentDefinition } from "../../lib/types";
import { useAgentProvisioningStore } from "../../stores/agent-provisioning";
import { AgentProvisioningPlaceholder } from "./agent-provisioning-placeholder";

interface AgentRendererProps {
  agentDef: AgentDefinition;
  agent: Agent;
  activeTabId: string;
}

export function AgentRenderer({
  agentDef,
  agent,
  activeTabId,
}: AgentRendererProps) {
  // While the agent's engine warms up (HOU-693), every non-activity tab
  // renders the provisioning placeholder instead of its content — the tab
  // would otherwise sit on its own spinner for the whole cold start. The
  // activity tab stays live: the in-chat card carries the message there.
  const provisioning = useAgentProvisioningStore((s) =>
    Boolean(s.provisioning[agent.id]),
  );
  return (
    <div className="h-full w-full relative min-h-0">
      {STANDARD_TABS.map((tab) => {
        const TabComponent = resolveTabComponent(tab);
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={
              isActive ? "h-full w-full flex flex-col min-h-0" : "hidden"
            }
          >
            {provisioning && tab.id !== DEFAULT_TAB_ID ? (
              <AgentProvisioningPlaceholder />
            ) : (
              <Suspense
                fallback={
                  <div className="h-full flex items-center justify-center">
                    <Spinner className="size-5" />
                  </div>
                }
              >
                <TabComponent agent={agent} agentDef={agentDef} />
              </Suspense>
            )}
          </div>
        );
      })}
    </div>
  );
}
