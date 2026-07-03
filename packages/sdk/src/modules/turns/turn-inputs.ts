/**
 * The turns module's command payloads + their untrusted-envelope validators.
 * The bridge path (`dispatch`) hands these raw JSON; each `as*Input` throws on
 * a bad shape (CommandRegistry.dispatch turns the throw into `ok: false`).
 */

/** Arguments for starting a turn — the `turns/send` command payload. */
export interface TurnSendInput {
  /** The agent whose sandbox runs the turn (informational for the single client). */
  agentId?: string;
  /** The conversation (session key) the turn belongs to. */
  conversationId: string;
  /** The user's message. */
  text: string;
  /** Override the wire nonce (default: a fresh random nonce). */
  nonce?: string;
  /** Switch the agent's active model for this turn onward. */
  model?: string;
  /** Reasoning effort to apply alongside `model`. */
  effort?: string;
}

/** The `turns/cancel` command payload. */
export interface TurnCancelInput {
  /** The agent whose sandbox holds the turn (omit for the single local runtime). */
  agentId?: string;
  /** The conversation whose in-flight turn to abort. */
  conversationId: string;
}

/** The `turns/observe` command payload. */
export interface TurnObserveInput {
  /** The agent whose sandbox holds the conversation (omit for the single local runtime). */
  agentId?: string;
  /** The conversation to passively attach to. */
  conversationId: string;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

export function asSendInput(payload: unknown): TurnSendInput {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (typeof p.conversationId !== "string" || typeof p.text !== "string")
    throw new Error("turns/send requires string conversationId and text");
  return {
    conversationId: p.conversationId,
    text: p.text,
    agentId: str(p.agentId),
    nonce: str(p.nonce),
    model: str(p.model),
    effort: str(p.effort),
  };
}

export function asCancelInput(payload: unknown): TurnCancelInput {
  const id = (payload as { conversationId?: unknown })?.conversationId;
  if (typeof id !== "string")
    throw new Error("turns/cancel requires a string conversationId");
  return {
    conversationId: id,
    agentId: str((payload as TurnCancelInput)?.agentId),
  };
}

export function asObserveInput(payload: unknown): TurnObserveInput {
  const id = (payload as { conversationId?: unknown })?.conversationId;
  if (typeof id !== "string")
    throw new Error("turns/observe requires a string conversationId");
  return {
    conversationId: id,
    agentId: str((payload as TurnObserveInput)?.agentId),
  };
}
