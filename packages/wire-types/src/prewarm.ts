/**
 * The conversation prewarm wire shapes:
 * `POST /v1/agents/:slug/conversations/:cid/prewarm`, sent while a person types
 * so the sandbox their next send runs in is already starting. Served only where
 * `Capabilities.conversationPrewarm` is true.
 */

/**
 * The provider and model the composer would send with. Both optional: the
 * gateway applies the send's own model clamp and canonicalizes display ids, so
 * an absent pair readies whatever the send would resolve to.
 */
export interface ConversationPrewarmInput {
  provider?: string;
  model?: string;
}

export const CONVERSATION_PREWARM_OUTCOMES = [
  "launching",
  "held",
  "skipped",
] as const;

/**
 * `launching`: a sandbox is starting for this conversation. `held`: one was
 * already held or starting, and its hold now runs from this request.
 * `skipped`: nothing is held and the send launches as it always did.
 */
export type ConversationPrewarmOutcome =
  (typeof CONVERSATION_PREWARM_OUTCOMES)[number];

/** The gateway's `202` answer. */
export interface ConversationPrewarmAnswer {
  outcome: ConversationPrewarmOutcome;
  /** Why a `skipped` prewarm readied nothing (a bounded metric label). */
  reason?: string;
  /** How long a held sandbox waits for the send after this request; 0 on a skip. */
  holdMs: number;
}

function isOutcome(value: unknown): value is ConversationPrewarmOutcome {
  return CONVERSATION_PREWARM_OUTCOMES.includes(
    value as ConversationPrewarmOutcome,
  );
}

/**
 * The answer, or a throw when the body is not one. Strict like the other
 * parsers here: an unknown outcome is a contract this client does not speak,
 * and a throw is how that drift reaches a report instead of being read as
 * something it is not.
 */
export function parseConversationPrewarmAnswer(
  value: unknown,
): ConversationPrewarmAnswer {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid prewarm answer");
  const body = value as Record<string, unknown>;
  if (!isOutcome(body.outcome))
    throw new Error("Invalid prewarm answer outcome");
  const holdMs = body.holdMs;
  if (typeof holdMs !== "number" || !Number.isFinite(holdMs) || holdMs < 0)
    throw new Error("Invalid prewarm answer hold");
  return {
    outcome: body.outcome,
    ...(typeof body.reason === "string" && body.reason
      ? { reason: body.reason }
      : {}),
    holdMs,
  };
}
