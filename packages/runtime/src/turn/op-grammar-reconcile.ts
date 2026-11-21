import type { ChatMessage } from "@houston/protocol";
import { ID, str } from "./op-grammar-fields";

export interface ReconcileOp {
  kind: "reconcile";
  conversationId: string;
  abandoned?: AbandonedTurn;
}

export interface AbandonedTurn {
  turnId: string;
  startedAt: string;
  routine: boolean;
  userMessage?: ChatMessage;
}

export function parseReconcileOp(raw: Record<string, unknown>): ReconcileOp {
  const conversationId = str(raw.conversationId, "op.conversationId");
  if (!ID.test(conversationId) || conversationId.includes(".."))
    throw new Error("invalid 'op.conversationId'");
  if (raw.abandoned === undefined) return { kind: "reconcile", conversationId };
  return {
    kind: "reconcile",
    conversationId,
    abandoned: parseAbandoned(raw.abandoned),
  };
}

function parseAbandoned(raw: unknown): AbandonedTurn {
  if (!raw || typeof raw !== "object")
    throw new Error("invalid 'op.abandoned'");
  const a = raw as Record<string, unknown>;
  const turnId = str(a.turnId, "op.abandoned.turnId");
  if (!ID.test(turnId)) throw new Error("invalid 'op.abandoned.turnId'");
  const startedAt = str(a.startedAt, "op.abandoned.startedAt");
  if (!Number.isFinite(Date.parse(startedAt)))
    throw new Error("invalid 'op.abandoned.startedAt'");
  const userMessage =
    a.userMessage === undefined
      ? undefined
      : parseUserMessage(a.userMessage, turnId);
  return {
    turnId,
    startedAt,
    routine: a.routine === true,
    ...(userMessage ? { userMessage } : {}),
  };
}

function parseUserMessage(raw: unknown, turnId: string): ChatMessage {
  const m = raw as Partial<ChatMessage> | null;
  if (
    !m ||
    typeof m !== "object" ||
    m.role !== "user" ||
    m.turnId !== turnId ||
    typeof m.content !== "string" ||
    typeof m.ts !== "number" ||
    !Number.isFinite(m.ts)
  ) {
    throw new Error("invalid 'op.abandoned.userMessage'");
  }
  return m as ChatMessage;
}
