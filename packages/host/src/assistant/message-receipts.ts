import { createHash } from "node:crypto";
import {
  type MessageAdmissionReceipt,
  MessageGrantsSchema,
  messageRetryContent,
  parseMessageNonce,
} from "@houston/protocol";
import type { AgentId } from "../domain/types";
import {
  assistantRuntimeRole,
  MANAGED_CLOUD_ENV,
} from "../launcher/assistant-role";
import type { ApprovalStore } from "./approvals";
import { applyApprovalReceipts } from "./receipts";

export class ApprovalMessageRefusal extends Error {
  constructor(
    readonly code:
      | "nonce_conflict"
      | "invalid_nonce"
      | "approval_guard_busy"
      | "approval_guard_unavailable"
      | "grants_not_allowed"
      | "invalid_grants",
  ) {
    super(code);
  }
}

const HOST_OWNED = ["approvals", "grants", "hostMessageFingerprint"] as const;

function withoutHostFields(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const {
    approvals: _receipts,
    grants: _grants,
    hostMessageFingerprint: _untrusted,
    ...rest
  } = body;
  return rest;
}

function forwarded(body: Record<string, unknown>, original: Buffer): Buffer {
  if (!HOST_OWNED.some((field) => field in body)) return original;
  return Buffer.from(JSON.stringify(withoutHostFields(body)));
}

export function prepareMessageReceipts(input: {
  approvals: ApprovalStore;
  agentId: AgentId;
  conversationId: string;
  actor: string;
  grantActor?: string;
  body: Buffer;
  parsed: Record<string, unknown> | null;
  durableReceipt?: MessageAdmissionReceipt | null;
}): { body: Buffer; release?: () => void; duplicate?: true } {
  const body = input.parsed;
  if (!body) return { body: input.body };
  const grants =
    body.grants === undefined
      ? undefined
      : MessageGrantsSchema.safeParse(body.grants);
  if (grants && !grants.success)
    throw new ApprovalMessageRefusal("invalid_grants");
  if (grants && !assistantRuntimeRole({ agentId: input.agentId }))
    throw new ApprovalMessageRefusal("grants_not_allowed");
  if (grants && process.env[MANAGED_CLOUD_ENV] === "1" && !input.grantActor)
    throw new ApprovalMessageRefusal("grants_not_allowed");
  const nonce = parseMessageNonce(body.nonce);
  if (nonce === false) throw new ApprovalMessageRefusal("invalid_nonce");
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
  if (guard?.kind !== "duplicate")
    input.approvals.grants.clear(input.agentId, input.conversationId);
  const issuedGrants: string[] = [];
  if (guard?.kind !== "duplicate" && grants?.success)
    for (const operation of new Set(grants.data))
      issuedGrants.push(
        input.approvals.grants.issue({
          agentId: input.agentId,
          conversationId: input.conversationId,
          operation,
          actor: input.grantActor ?? input.actor,
          requiresActor: input.grantActor !== undefined,
        }),
      );
  return {
    body: nonce
      ? Buffer.from(
          JSON.stringify({
            ...withoutHostFields(body),
            hostMessageFingerprint: hostFingerprint,
          }),
        )
      : forwarded(body, input.body),
    ...(guard?.kind === "new" || issuedGrants.length
      ? {
          release: () => {
            if (guard?.kind === "new") guard.release();
            for (const id of issuedGrants) input.approvals.grants.revoke(id);
          },
        }
      : {}),
    ...(guard?.kind === "duplicate" ? { duplicate: true as const } : {}),
  };
}
