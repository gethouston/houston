/**
 * Pure lock decision for the chat model picker (ChatModelSelector).
 *
 * Split out from the component (like the sibling `model-picker.ts` helpers) so
 * the Teams gate is unit-testable without a React renderer and the container
 * stays under the file-size budget.
 */

import type { Agent, Capabilities } from "@houston-ai/engine-client";
import { canEditAgentConfig } from "./org-roles.ts";

/**
 * Whether the model picker must render locked (read-only) for the current
 * caller. Teams matrix v2 (contract §1/§6): only an agent-manager may change an
 * agent's AI model; a plain org member sees the pinned provider/model but
 * cannot open the dropdown or switch provider/effort.
 *
 * - No `agent` scope (`null`/`undefined`) → never locked. Non-agent surfaces
 *   (and callers that don't thread an agent) keep their prior free behavior.
 * - Otherwise defer to {@link canEditAgentConfig}, which short-circuits to
 *   editable in single-player and for owners, so self-host is never locked.
 */
export function isModelSelectorLocked(
  capabilities: Capabilities | null | undefined,
  agent: Pick<Agent, "access"> | null | undefined,
): boolean {
  if (agent == null) return false;
  return !canEditAgentConfig(capabilities, agent);
}
