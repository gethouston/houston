import type { InteractionStep } from "@houston/protocol";
import { canSubmitKey } from "./custom-integration-card-state.ts";

/**
 * Pure logic for the inline MCP-server setup card (`McpServerCard`) — the secure
 * card the chat renders in place of the composer when the agent proposes
 * connecting a remote MCP server (`propose_mcp_server` → an
 * `mcp_server` interaction step). Mirrors `custom-integration-card-state`: hostname/favicon and
 * the length gate are REUSED from that module; only the MCP-specific pieces (the
 * auth-aware submit gate, the dedupe key, the target resolver) live here so they
 * stay unit-testable without a DOM.
 *
 * The secret (bearer token / header value) NEVER flows through this module: it
 * lives only in the card's local input state and the single create call. Nothing
 * here reads, stores, derives from, or logs it.
 */

/** The agent-authored proposal, straight off the interaction step. */
export type McpProposal = Extract<
  InteractionStep,
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

// MCP-server proposals render as steps in the unified ChatInteractionCard (see
// useAgentChatPanel's composerOverride), gated on `mcpIntegrationsSupported(capabilities)`
// so the card stays off hosts with no `mcp` provider to create against. No
// standalone resolver is needed.
