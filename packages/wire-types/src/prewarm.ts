export interface ConversationPrewarmInput {
  provider?: string;
  model?: string;
}

export const CONVERSATION_PREWARM_OUTCOMES = [
  "launching",
  "held",
  "skipped",
] as const;

export type ConversationPrewarmOutcome =
  (typeof CONVERSATION_PREWARM_OUTCOMES)[number];

export interface ConversationPrewarmAnswer {
  outcome: ConversationPrewarmOutcome;
  reason?: string;
  holdMs: number;
}

function isOutcome(value: unknown): value is ConversationPrewarmOutcome {
  return CONVERSATION_PREWARM_OUTCOMES.includes(
    value as ConversationPrewarmOutcome,
  );
}

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
