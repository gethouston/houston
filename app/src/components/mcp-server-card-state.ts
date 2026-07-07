import type { PendingInteraction } from "@houston/protocol";
import { canSubmitKey } from "./custom-integration-card-state.ts";

/**
 * Pure logic for the inline MCP-server setup card (`McpServerCard`) — the secure
 * card the chat renders in place of the composer when the agent proposes
 * connecting a remote MCP server (`propose_mcp_server` → PendingInteraction
 * `mcp_server`). Mirrors `custom-integration-card-state`: hostname/favicon and
 * the length gate are REUSED from that module; only the MCP-specific pieces (the
 * auth-aware submit gate, the dedupe key, the target resolver) live here so they
 * stay unit-testable without a DOM.
 *
 * The secret (bearer token / header value) NEVER flows through this module: it
 * lives only in the card's local input state and the single create call. Nothing
 * here reads, stores, derives from, or logs it.
 */

/** The agent-authored proposal, straight off the PendingInteraction member. */
export type McpProposal = Extract<
  PendingInteraction,
  { kind: "mcp_server" }
>["proposal"];

/**
 * Does this server's auth need a secret from the user? `bearer` and `header`
 * carry a secret value the card must collect; `none` needs nothing, so the card
 * hides the secret field and enables Add immediately.
 */
export function mcpNeedsSecret(auth: McpProposal["auth"]): boolean {
  return auth.type !== "none";
}

/**
 * Is the card submittable? For a secret-bearing auth the typed value must clear
 * the gateway's `1..4096` bound (REUSING `canSubmitKey`); for `none` there is no
 * secret, so Add is always available. The card disables Add until this holds.
 */
export function canSubmitMcp(
  auth: McpProposal["auth"],
  secret: string,
): boolean {
  if (auth.type === "none") return true;
  return canSubmitKey(secret);
}

/**
 * A stable identity for a proposal within a conversation, so the chat panel can
 * suppress a card the user already added or dismissed WITHOUT also suppressing a
 * different proposal the agent makes later on the same activity. Keyed by
 * activity + the proposal's name and URL (the two the user reasoned about); the
 * secret is deliberately never part of it.
 */
export function mcpProposalDismissKey(
  activityId: string,
  proposal: McpProposal,
): string {
  return `${activityId} ${proposal.name} ${proposal.url}`;
}

/** What the chat needs to render an active MCP-server setup card. */
export interface McpCardTarget {
  proposal: McpProposal;
  reason?: string;
  /** The dedupe key to settle once the user adds or dismisses this proposal. */
  dismissKey: string;
}

/**
 * Decide whether the composer should be replaced by the secure MCP-server setup
 * card, and with which proposal. The single source of truth for the chat panel's
 * `composerOverride` gate.
 *
 * `mcpSupported` MUST come from `mcpIntegrationsSupported(capabilities)`, NOT the
 * broader `integrationsSupported`: a host without the `mcp` provider (self-host
 * direct, or composio+custom only) can still let the model emit an `mcp_server`
 * pending interaction, but has no provider to create against, so the card would
 * render and every Add would 404. Gating on the narrower predicate keeps the
 * card off exactly those hosts.
 *
 * Returns `null` (show the normal composer) when the deployment can't serve MCP
 * servers, there's no open activity, the pending interaction isn't an MCP
 * proposal, or the user already added/dismissed this exact proposal.
 */
export function resolveMcpCardTarget(
  mcpSupported: boolean,
  activityId: string | null,
  interaction: PendingInteraction | null | undefined,
  resolved: ReadonlySet<string>,
): McpCardTarget | null {
  if (!mcpSupported || !activityId) return null;
  if (interaction?.kind !== "mcp_server") return null;
  const dismissKey = mcpProposalDismissKey(activityId, interaction.proposal);
  if (resolved.has(dismissKey)) return null;
  return {
    proposal: interaction.proposal,
    reason: interaction.reason,
    dismissKey,
  };
}
