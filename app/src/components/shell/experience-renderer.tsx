import { Spinner } from "@houston-ai/core";
import { Suspense } from "react";
import { visibleAgentTabs } from "../../agents/standard-tabs";
import { resolveTabComponent } from "../../agents/tab-resolver";
import { useCapabilities } from "../../hooks/use-capabilities";
import type { Agent, AgentDefinition } from "../../lib/types";

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
  const { capabilities } = useCapabilities();
  return (
    <div className="h-full w-full relative min-h-0">
      {visibleAgentTabs(capabilities, agent).map((tab) => {
        const TabComponent = resolveTabComponent(tab);
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={
              isActive ? "h-full w-full flex flex-col min-h-0" : "hidden"
            }
          >
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center">
                  <Spinner className="size-5" />
                </div>
              }
            >
              <TabComponent agent={agent} agentDef={agentDef} />
            </Suspense>
          </div>
        );
      })}
    </div>
  );
}
