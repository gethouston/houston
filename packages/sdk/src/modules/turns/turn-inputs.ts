/**
 * The turns module's command payloads + their untrusted-envelope validators.
 * The bridge path (`dispatch`) hands these raw JSON; each `as*Input` throws on
 * a bad shape (CommandRegistry.dispatch turns the throw into `ok: false`).
 */

import { parseMentions } from "@houston/protocol";
import type { FeedAuthor, FeedMention } from "./vm-output";

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
  /**
   * Who is sending, in a multiplayer deployment: stamps the optimistic bubble
   * so a shared conversation attributes it immediately (see
   * `StreamTurnOptions.author`). Omitted single-player / signed out.
   */
  author?: FeedAuthor;
  /**
   * The teammates this message @mentions, in a multiplayer deployment: chips
   * the optimistic bubble so a shared conversation names them immediately (see
   * `StreamTurnOptions.mentions`). The model only ever sees the plain `@Name`
   * text inside `text`. Omitted when the message mentions nobody.
   */
  mentions?: FeedMention[];
}

/**
 * What every command that acts on ONE existing conversation carries: backs
 * `turns/cancel`, `turns/observe`, `turns/history` and
 * `turns/dismissInteraction`. The agent is required — it is the sandbox the
 * conversation lives in, and the single local runtime names itself with `""`.
 */
export interface TurnConversationInput {
  /** The agent whose sandbox holds the conversation. */
  agentId: string;
  /** The conversation the command acts on. */
  conversationId: string;
}

/** The `turns/setMode` command payload. */
export interface TurnSetModeInput extends TurnConversationInput {
  /** The execution mode the running turn adopts at its next decision point. */
  mode: "execute" | "plan" | "auto";
}

/** The `turns/truncate` command payload. */
export interface TurnTruncateInput extends TurnConversationInput {
  /** The user turn the transcript is cut at; it and everything after it go. */
  turnId: string;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** Untrusted-envelope guard for the per-turn mode pin: only the known literals
 *  ("execute", "plan", "auto") pass; anything else drops to undefined (turn
 *  stays "execute"). */
const mode = (v: unknown): "execute" | "plan" | "auto" | undefined =>
  v === "execute" || v === "plan" || v === "auto" ? v : undefined;

/** Untrusted-envelope guard for the sender identity: only an object carrying a
 *  non-empty string `userId` passes (with an optional string `name`); anything
 *  else drops to undefined and the bubble stays authorless. */
const author = (v: unknown): FeedAuthor | undefined => {
  const a = v as { userId?: unknown; name?: unknown } | null | undefined;
  if (!a || typeof a.userId !== "string" || a.userId === "") return undefined;
  return {
    userId: a.userId,
    ...(typeof a.name === "string" ? { name: a.name } : {}),
  };
};

/** Untrusted-envelope guard for the @mention sidecar. The protocol owns the ONE
 *  definition of what a mention is (`parseMentions`: array only, entries need a
 *  non-empty string `userId`, `name` kept only when a string, junk entries
 *  dropped rather than failing the send, capped, empty -> undefined) — the send
 *  route and the runtime read the wire through the same function, so a mention
 *  that survives here survives there. */
const mentions = (v: unknown): FeedMention[] | undefined => parseMentions(v);

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
    author: author(p.author),
    mentions: mentions(p.mentions),
  };
}

/** Guard for every one-conversation command; `command` names it in the throw. */
export function asConversationInput(
  payload: unknown,
  command: string,
): TurnConversationInput {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (typeof p.conversationId !== "string" || typeof p.agentId !== "string")
    throw new Error(`${command} requires string agentId and conversationId`);
  return { agentId: p.agentId, conversationId: p.conversationId };
}

export function asSetModeInput(payload: unknown): TurnSetModeInput {
  const picked = mode((payload as { mode?: unknown })?.mode);
  if (!picked) throw new Error("turns/setMode requires a known mode");
  return { ...asConversationInput(payload, "turns/setMode"), mode: picked };
}

export function asTruncateInput(payload: unknown): TurnTruncateInput {
  const turnId = str((payload as { turnId?: unknown })?.turnId);
  if (turnId === undefined)
    throw new Error("turns/truncate requires a string turnId");
  return { ...asConversationInput(payload, "turns/truncate"), turnId };
}
