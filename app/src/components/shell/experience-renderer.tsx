import { Suspense, useMemo } from "react";
import { Spinner } from "@houston-ai/core";
import { resolveTabComponent } from "../../agents/tab-resolver";
import { tauriAgent, tauriFiles, tauriChat } from "../../lib/tauri";
import type {
  AgentDefinition,
  Agent,
  AgentTab,
  CustomTabProps,
} from "../../lib/types";

interface AgentRendererProps {
  agentDef: AgentDefinition;
  agent: Agent;
  tabs: AgentTab[];
  activeTabId: string;
}

/** Build the extra props injected into custom (bundle.js) tab components. */
function useCustomTabProps(
  agent: Agent,
): Omit<CustomTabProps, "agent" | "agentDef"> {
  return useMemo(
    () => ({
      readFile: (name: string) => tauriAgent.readFile(agent.folderPath, name),
      writeFile: (name: string, content: string) =>
        tauriAgent.writeFile(agent.folderPath, name, content),
      listFiles: async () => {
        const entries = await tauriFiles.list(agent.folderPath);
        return entries.map((e) => ({
          path: e.path,
          name: e.name,
          size: e.size,
        }));
      },
      sendMessage: (text: string) => {
        tauriChat.send(agent.folderPath, text, "primary").catch((err) => {
          console.error("[custom-tab] sendMessage failed:", err);
        });
      },
    }),
    [agent.folderPath],
  );
}

export function AgentRenderer({
  agentDef,
  agent,
  tabs,
  activeTabId,
}: AgentRendererProps) {
  const customProps = useCustomTabProps(agent);

  return (
    <div className="h-full w-full relative min-h-0">
      {tabs.map((tab) => {
        const TabComponent = resolveTabComponent(tab, agentDef);
        const isActive = tab.id === activeTabId;
        const isCustom = Boolean(tab.customComponent);
        const props = isCustom
          ? { agent, agentDef, ...customProps }
          : { agent, agentDef };
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
              <TabComponent {...props} />
            </Suspense>
          </div>
        );
      })}
    </div>
  );
}
