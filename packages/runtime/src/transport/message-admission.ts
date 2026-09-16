import {
  isMessageFingerprint,
  messageRetryContent,
  parseMessageNonce,
} from "@houston/protocol";
import { config } from "../config";
import {
  actingFromHeaders,
  credentialScopeKeyFor,
} from "../session/acting-context";
import { getHistory } from "../store/conversations";
import {
  type Admission,
  MessageAdmissions,
  messageFingerprint,
} from "../store/message-admissions";
import { json, type RouteContext } from "./http-helpers";

const admissions = new MessageAdmissions(
  config.dataDir,
  (id, turnId) =>
    getHistory(id)?.messages.some(
      (message) => message.role === "assistant" && message.turnId === turnId,
    ) ?? false,
);

export interface MessageAdmissionInput {
  nonce: string;
  fingerprint: string;
  hostFingerprint?: string;
}

/** Ignore gateway-enriched context and rotating token bytes when matching retries. */
export function admissionInput(
  ctx: RouteContext,
  body: Record<string, unknown>,
): MessageAdmissionInput | undefined | false {
  const nonce = parseMessageNonce(body.nonce);
  if (nonce === undefined) return undefined;
  if (nonce === false) {
    json(ctx.res, 400, {
      error: "nonce must contain 1 to 256 characters",
      code: "invalid_nonce",
    });
    return false;
  }
  const acting = actingFromHeaders(ctx.req.headers);
  const hostFingerprint = isMessageFingerprint(body.hostMessageFingerprint)
    ? body.hostMessageFingerprint
    : undefined;
  return {
    nonce,
    fingerprint: messageFingerprint([
      messageRetryContent(
        body,
        JSON.stringify([
          credentialScopeKeyFor(acting?.actingAs),
          acting?.actingUser ?? null,
        ]),
      ),
      hostFingerprint ?? null,
    ]),
    hostFingerprint,
  };
}

export function replyExistingAdmission(
  ctx: RouteContext,
  id: string,
  input: MessageAdmissionInput | undefined,
): boolean {
  if (!input) return false;
  const existing = admissions.inspect(id, input.nonce, input.fingerprint);
  if (!existing) return false;
  replyAdmission(ctx, id, existing);
  return true;
}

/** Synchronous reservation after every rejection gate; concurrent retries converge here. */
export function acceptAdmission(
  ctx: RouteContext,
  id: string,
  input: MessageAdmissionInput | undefined,
): string | undefined | false {
  if (!input) return undefined;
  const result = admissions.accept(
    id,
    input.nonce,
    input.fingerprint,
    input.hostFingerprint,
  );
  if (result.kind === "new") return result.turnId;
  replyAdmission(ctx, id, result);
  return false;
}

export function trackAdmission(
  id: string,
  input: MessageAdmissionInput | undefined,
  turn: Promise<void>,
): Promise<void> {
  return input ? turn.finally(() => admissions.settle(id, input.nonce)) : turn;
}

function replyAdmission(
  ctx: RouteContext,
  id: string,
  admission: Admission,
): void {
  if (admission.kind === "conflict") {
    json(ctx.res, 409, {
      error: "nonce already belongs to another message",
      code: "nonce_conflict",
      turnId: admission.turnId,
    });
  } else if (admission.kind === "interrupted") {
    json(ctx.res, 409, {
      error: "message outcome is uncertain; do not resend automatically",
      code: "turn_interrupted",
      turnId: admission.turnId,
    });
  } else {
    json(ctx.res, 202, {
      ok: true,
      id,
      turnId: admission.turnId,
      duplicate: true,
    });
  }
}
