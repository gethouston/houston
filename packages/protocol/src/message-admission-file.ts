import { createHash } from "node:crypto";
import {
  MESSAGE_ADMISSIONS_DIRECTORY,
  messageAdmissionIdentity,
} from "./message-retry";

export function messageAdmissionFileName(
  conversationId: string,
  nonce: string,
): string {
  const key = createHash("sha256")
    .update(messageAdmissionIdentity(conversationId, nonce))
    .digest("hex");
  return `${MESSAGE_ADMISSIONS_DIRECTORY}/${key}.json`;
}
