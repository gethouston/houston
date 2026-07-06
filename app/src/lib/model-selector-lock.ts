/**
 * Pure visibility decision for the chat model + effort pickers
 * (ChatModelSelector / ChatEffortSelector).
 *
 * Split out from the components (like the sibling `model-picker.ts` helpers) so
 * the Teams gate is unit-testable without a React renderer and the containers
 * stay under the file-size budget.
 */

import type { Agent, Capabilities } from "@houston-ai/engine-client";
import { canEditAgentConfig } from "./org-roles.ts";

/**
 * Whether the model/effort picker should render at all for the current caller.
 * Teams matrix v2 (contract §1/§6): only an agent-manager may change an agent's
 * AI model, and a plain org member should never even see which model the agent
 * uses — the picker is HIDDEN for them, not merely locked.
 *
 * - No `agent` scope (`null`/`undefined`) → always shown. Non-agent surfaces
 *   (and callers that don't thread an agent) keep their prior free behavior.
 * - Otherwise defer to {@link canEditAgentConfig}, which short-circuits to
 *   editable in single-player and for owners, so self-host always shows it.
 */
export function shouldShowModelSelector(
  capabilities: Capabilities | null | undefined,
  agent: Pick<Agent, "access"> | null | undefined,
): boolean {
  if (agent == null) return true;
  return canEditAgentConfig(capabilities, agent);
}
