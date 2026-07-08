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
  /**
   * Model to run THIS turn on (a per-turn pin, paired with its owning provider
   * on the wire). Never moves the agent-wide settings other conversations
   * fall back to (HOU-695).
   */
  model?: string;
  /** Reasoning effort to apply alongside `model`. */
  effort?: string;
  /**
   * Per-turn execution mode ("plan" = read-only + planning overlay; "auto" =
   * Autopilot, acts without the blocking tools). A pure per-turn pin like
   * `effort` — never writes agent settings (HOU-695). Omitted, the runtime runs
   * the turn as "execute".
   */
  mode?: "execute" | "plan" | "auto";
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

/** The `turns/history` command payload. */
export interface TurnHistoryInput {
  /** The agent whose sandbox holds the conversation (omit for the single local runtime). */
  agentId?: string;
  /** The conversation whose persisted transcript to fold into feed frames. */
  conversationId: string;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** Untrusted-envelope guard for the per-turn mode pin: only the known literals
 *  ("execute", "plan", "auto") pass; anything else drops to undefined (turn
 *  stays "execute"). */
const mode = (v: unknown): "execute" | "plan" | "auto" | undefined =>
  v === "execute" || v === "plan" || v === "auto" ? v : undefined;

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
    mode: mode(p.mode),
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

export function asHistoryInput(payload: unknown): TurnHistoryInput {
  const id = (payload as { conversationId?: unknown })?.conversationId;
  if (typeof id !== "string")
    throw new Error("turns/history requires a string conversationId");
  return {
    conversationId: id,
    agentId: str((payload as TurnHistoryInput)?.agentId),
  };
}
