import { createHash } from "node:crypto";
import {
  MESSAGE_ADMISSIONS_DIRECTORY,
  messageAdmissionIdentity,
} from "./message-retry";

/**
 * SUBPATH EXPORT ONLY — deliberately absent from this package's barrel
 * (`@houston/protocol`). The barrel is browser-facing: `app` and `packages/web`
 * typecheck and bundle it, and `node:crypto` is not resolvable there. Only
 * Node/Bun consumers (the runtime writer and the host reader) import
 * `@houston/protocol/message-admission-file`.
 *
 * Where one message's admission receipt lives, relative to the agent's data
 * root: the sha256 of its identity, so any conversation id and nonce produce a
 * filesystem-safe, collision-free basename.
 *
 * The runtime writes this file before it executes a message and the host reads
 * it before it touches approvals, from two different processes over the same
 * data tree. Both sides MUST derive the path here: if they ever disagree by a
 * byte, the host stops seeing accepted receipts and every retry reads as a
 * brand-new message — the exact double-execution the receipt exists to prevent.
 */
export function messageAdmissionFileName(
  conversationId: string,
  nonce: string,
): string {
  const key = createHash("sha256")
    .update(messageAdmissionIdentity(conversationId, nonce))
    .digest("hex");
  return `${MESSAGE_ADMISSIONS_DIRECTORY}/${key}.json`;
}
