import { agentFileEventType } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";

/**
 * Map a changed path (relative to `~/.houston/workspaces`) to a reactivity
 * event — the local analog of the cloud host's post-mutation emits, matching
 * engine/houston-file-watcher's classification. The agentPath is the
 * `<Workspace>/<Agent>` prefix (the agent's opaque key locally).
 *
 * The path→event decision lives in `@houston/domain` (`agentFileEventType`) so
 * this watcher and the web adapter's write-through echo classify identically.
 *
 * Returns null for paths not inside an agent or not worth an event.
 */
export function classifyChange(relPath: string): HoustonEvent | null {
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  if (parts.length < 3) return null; // need <Workspace>/<Agent>/<something>
  const agentPath = `${parts[0]}/${parts[1]}`;
  const rest = parts.slice(2).join("/");
  const type = agentFileEventType(rest);
  return type ? { type, agentPath } : null;
}
