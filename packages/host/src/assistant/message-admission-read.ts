import {
  isMessageAdmissionReceipt,
  type MessageAdmissionReceipt,
  parseMessageNonce,
} from "@houston/protocol";
import { messageAdmissionFileName } from "@houston/protocol/message-admission-file";
import type { Vfs } from "../vfs";
import { ApprovalMessageRefusal } from "./message-receipts";

/**
 * The same persisted record the standing runtime claims before execution.
 * Takes the turn body already parsed (`turn-body.ts`) so one request never
 * parses its own bytes twice.
 */
export async function readMessageAdmission(
  vfs: Vfs | undefined,
  dataRoot: string,
  conversationId: string,
  body: Record<string, unknown> | null,
): Promise<MessageAdmissionReceipt | null> {
  if (!body || !("nonce" in body)) return null;
  const nonce = parseMessageNonce(body.nonce);
  if (!nonce) return null;
  if (!vfs) throw new ApprovalMessageRefusal("approval_guard_unavailable");
  const text = await vfs.readText(
    `${dataRoot}/${messageAdmissionFileName(conversationId, nonce)}`,
  );
  if (text === null) return null;
  const receipt: unknown = JSON.parse(text);
  if (!isMessageAdmissionReceipt(receipt))
    throw new Error("Invalid message admission receipt");
  return receipt;
}
