import { agentFileEventType } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";

type AgentEventType = Extract<HoustonEvent, { agentPath: string }>["type"];
type TurnChangedEventType = AgentEventType | "CustomIntegrationsChanged";

export function changedEventTypes(
  layout: { workspaceRel: string; dataRel: string },
  keys: readonly string[],
): TurnChangedEventType[] {
  const workspacePrefix = `${layout.workspaceRel}/`;
  const dataPrefix = `${layout.dataRel}/`;
  const out = new Set<TurnChangedEventType>();
  for (const key of keys) {
    if (key === "custom-integrations.json") {
      out.add("CustomIntegrationsChanged");
    } else if (key.startsWith(workspacePrefix)) {
      const type = agentFileEventType(key.slice(workspacePrefix.length));
      if (type) out.add(type);
    } else if (
      key.startsWith(`${dataPrefix}conversations/`) ||
      key.startsWith(`${dataPrefix}sessions/`)
    ) {
      out.add("ConversationsChanged");
    }
  }
  return [...out].sort();
}

export function announcedOpEvents(
  events: readonly HoustonEvent[],
  projectionFailures: readonly string[],
): (AgentEventType | "CustomIntegrationsChanged")[] {
  if (projectionFailures.length > 0) return [];
  const out = new Set<AgentEventType | "CustomIntegrationsChanged">();
  for (const event of events) {
    if ("agentPath" in event || event.type === "CustomIntegrationsChanged")
      out.add(event.type);
  }
  return [...out].sort();
}
