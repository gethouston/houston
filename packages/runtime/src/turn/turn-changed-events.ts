import { agentFileEventType } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";

type AgentEventType = Extract<HoustonEvent, { agentPath: string }>["type"];

/**
 * The domain events a pool turn's durable writes imply, derived from the
 * store-relative keys the sync-back landed. A pod emits these from its
 * handlers; a worker has no event bus, so the written objects ARE the signal.
 * Keys with no client-visible cache map to nothing. Sorted, each type once:
 * the list is a set on the wire.
 *
 * A claimed turn's sync-back scope is its conversation, session, the granted
 * docs, AND every ordinary workspace file (see `claimedTurnIncludes`). Each
 * key is made agent-workspace-relative and run through the SAME classifier the
 * host uses (`agentFileEventType`), so a bash-written `report.pdf` at the
 * workspace root fires `FilesChanged` and a `CLAUDE.md` fires `ContextChanged`
 * — not the old files/-subtree-only special case that left root writes silent.
 * The `cloudrun` layout keeps data under a sibling `dataRel` tree, so its
 * conversation/session keys are mapped explicitly; the `standing` layout has
 * data under `${workspaceRel}/.houston/runtime`, caught by the relative path.
 */
export function changedEventTypes(
  layout: { workspaceRel: string; dataRel: string },
  keys: readonly string[],
): AgentEventType[] {
  const workspacePrefix = `${layout.workspaceRel}/`;
  const dataPrefix = `${layout.dataRel}/`;
  const out = new Set<AgentEventType>();
  for (const key of keys) {
    if (key.startsWith(workspacePrefix)) {
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

/**
 * What an op reply may announce: the handler's events, but only once every
 * projection the refetch would read is durable. A lagging doc announced
 * early sends every member's tab to a read the gateway cannot serve asleep.
 */
export function announcedOpEvents(
  events: readonly HoustonEvent[],
  projectionFailures: readonly string[],
): (AgentEventType | "CustomIntegrationsChanged")[] {
  if (projectionFailures.length > 0) return [];
  const out = new Set<AgentEventType | "CustomIntegrationsChanged">();
  for (const event of events) {
    // CustomIntegrationsChanged is the one agent-scoped event the protocol
    // ships without an agentPath (clients invalidate globally).
    if ("agentPath" in event || event.type === "CustomIntegrationsChanged")
      out.add(event.type);
  }
  return [...out].sort();
}
