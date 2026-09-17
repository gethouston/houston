import { normalizeTurnMode, parseMentions } from "./conversation";
import { parseMessageApprovals } from "./domain/approval";

export const MESSAGE_ADMISSIONS_DIRECTORY = "message-admissions";

/** Shared by the runtime writer and the host's pre-approval read. */
export interface MessageAdmissionReceipt {
  version: 1;
  fingerprint: string;
  turnId: string;
  hostFingerprint?: string;
}

export function isMessageAdmissionReceipt(
  value: unknown,
): value is MessageAdmissionReceipt {
  if (typeof value !== "object" || value === null) return false;
  const receipt = value as Partial<MessageAdmissionReceipt>;
  return (
    receipt.version === 1 &&
    isMessageFingerprint(receipt.fingerprint) &&
    typeof receipt.turnId === "string" &&
    receipt.turnId.length > 0 &&
    (receipt.hostFingerprint === undefined ||
      isMessageFingerprint(receipt.hostFingerprint))
  );
}

export function isMessageFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/** Hash this identity for a filesystem-safe receipt basename. */
export function messageAdmissionIdentity(
  conversationId: string,
  nonce: string,
): string {
  return JSON.stringify([conversationId, nonce]);
}

/** Absent is an ordinary send; malformed is a refusal before any receipt mutation. */
export function parseMessageNonce(value: unknown): string | undefined | false {
  if (value === undefined) return undefined;
  return typeof value === "string" && value.length > 0 && value.length <= 256
    ? value
    : false;
}

/** Stable sender intent, excluding refreshed gateway context and token bytes. */
export function messageRetryContent(
  body: Record<string, unknown>,
  actor: string,
): string {
  const string = (value: unknown) => (typeof value === "string" ? value : null);
  return JSON.stringify([
    body.text,
    string(body.displayText),
    string(body.provider),
    string(body.model),
    string(body.effort),
    normalizeTurnMode(body.mode),
    parseMentions(body.mentions) ?? null,
    actor,
    parseMessageApprovals(body.approvals),
  ]);
}
