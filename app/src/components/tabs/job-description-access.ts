import type { Agent, Capabilities } from "@houston-ai/engine-client";
import { canEditAgentConfig } from "../../lib/org-roles.ts";

/**
 * Whether the Agent Settings tab (instructions / skills / learnings / general)
 * should render as a READ-ONLY "managed by your organization" surface for the
 * current caller. Matrix v2 (contract §1): configure-scope edits are
 * agent-manager only. A plain member sees the content but no editing
 * affordances; the gateway 403s any write regardless.
 *
 * Delegates entirely to {@link canEditAgentConfig} (=== `isAgentManager`) so the
 * one authority definition stays in `org-roles`. Single-player / self-host (no
 * multiplayer capability) always returns `false` here — zero visual change from
 * today, the sole user owns everything.
 */
export function isConfigReadOnly(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): boolean {
  return !canEditAgentConfig(caps, agent);
}
