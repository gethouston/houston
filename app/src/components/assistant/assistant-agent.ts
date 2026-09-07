import type { AssistantHandle } from "../../lib/tauri";
import type { Agent } from "../../lib/types";

/**
 * The palette id the assistant wears. A token id (never a hex) so
 * `resolveAgentColor` resolves it per theme like any other agent's helmet.
 */
export const ASSISTANT_AGENT_COLOR = "navy";

/**
 * The assistant AS an agent, for the per-agent chat plumbing.
 *
 * Discovery hands back an address, not a roster row: the assistant is hidden
 * on purpose (a dot-named directory the local store never lists), so it never
 * arrives through `tauriAgents.list` and there is no record to look up. Every
 * per-agent call takes the id and the folder path, which on the TS engine are
 * the same opaque route key — the one thing discovery answers — so this builds
 * the record the chat hook expects around it.
 *
 * `configId` and `createdAt` are inert here: nothing in the chat path reads
 * them, and the assistant has no config record to name or creation moment to
 * show. They carry the same literal every render so the object stays stable.
 *
 * Pure, so the shape is asserted without a React tree.
 */
export function assistantAgent(handle: AssistantHandle, name: string): Agent {
  return {
    id: handle.agent,
    name,
    folderPath: handle.agent,
    configId: handle.agent,
    color: ASSISTANT_AGENT_COLOR,
    createdAt: "",
  };
}
