import { createHash } from "node:crypto";
import {
  type MessageAdmissionReceipt,
  messageRetryContent,
  parseMessageNonce,
} from "@houston/protocol";
import type { AgentId } from "../domain/types";
import type { ApprovalStore } from "./approvals";
import { applyApprovalReceipts } from "./receipts";

export class ApprovalMessageRefusal extends Error {
  constructor(
    readonly code:
      | "nonce_conflict"
      | "invalid_nonce"
      | "approval_guard_busy"
      | "approval_guard_unavailable",
  ) {
    super(code);
  }
}

/** The host-owned fields a client may propose but never have forwarded. */
const HOST_OWNED = ["approvals", "hostMessageFingerprint"] as const;

function withoutHostFields(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const {
    approvals: _receipts,
    hostMessageFingerprint: _untrusted,
    ...rest
  } = body;
  return rest;
}

/**
 * The bytes to forward. Serializing is skipped when the request carried nothing
 * host-owned, so an ordinary message reaches the runtime as the exact bytes the
 * client sent.
 */
function forwarded(body: Record<string, unknown>, original: Buffer): Buffer {
  if (!HOST_OWNED.some((field) => field in body)) return original;
  return Buffer.from(JSON.stringify(withoutHostFields(body)));
}

/** Guard before touching approvals; rejection releases only this request's own reservation. */
export function prepareMessageReceipts(input: {
  approvals: ApprovalStore;
  agentId: AgentId;
  conversationId: string;
  actor: string;
  body: Buffer;
  /** The body's parsed object (`turn-body.ts`), or null when it is not one. */
  parsed: Record<string, unknown> | null;
  durableReceipt?: MessageAdmissionReceipt | null;
}): { body: Buffer; release?: () => void; duplicate?: true } {
  const body = input.parsed;
  // A body that is not the JSON this route speaks is left entirely alone: what
  // to tell the client about it belongs to the channel it is headed for.
  if (!body) return { body: input.body };
  const nonce = parseMessageNonce(body.nonce);
  if (nonce === false) throw new ApprovalMessageRefusal("invalid_nonce");
  // A malformed request must not mutate approvals or reserve an identity - and
  // must not carry host-owned fields past this seam either.
  if (typeof body.text !== "string" || !body.text)
    return { body: forwarded(body, input.body) };
  const content = messageRetryContent(body, input.actor);
  const hostFingerprint = createHash("sha256").update(content).digest("hex");
  if (
    input.durableReceipt &&
    input.durableReceipt.hostFingerprint !== hostFingerprint
  )
    throw new ApprovalMessageRefusal("nonce_conflict");
  const guard = nonce
    ? input.durableReceipt
      ? { kind: "duplicate" as const }
      : input.approvals.messages.reserve(
          input.agentId,
          input.conversationId,
          nonce,
          content,
        )
    : undefined;
  if (guard?.kind === "conflict")
    throw new ApprovalMessageRefusal("nonce_conflict");
  if (guard?.kind === "full")
    throw new ApprovalMessageRefusal("approval_guard_busy");
  // Only a message the user actually sent mints or retires receipts, and only
  // when a card is live for this agent and conversation - so the hot turn path
  // pays a map lookup and nothing else.
  if (
    guard?.kind !== "duplicate" &&
    input.approvals.hasPending(input.agentId, input.conversationId)
  )
    applyApprovalReceipts({
      approvals: input.approvals,
      agentId: input.agentId,
      conversationId: input.conversationId,
      field: body.approvals,
    });
  // Receipts never reach the runtime, even after they expired or were spent,
  // and the retry fingerprint it does see is authored here, never copied.
  return {
    body: nonce
      ? Buffer.from(
          JSON.stringify({
            ...withoutHostFields(body),
            hostMessageFingerprint: hostFingerprint,
          }),
        )
      : forwarded(body, input.body),
    ...(guard?.kind === "new" ? { release: guard.release } : {}),
    ...(guard?.kind === "duplicate" ? { duplicate: true as const } : {}),
  };
}
