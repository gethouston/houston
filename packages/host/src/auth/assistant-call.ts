import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import {
  ACTING_AS_HEADER,
  ACTING_VIA_ASSISTANT,
  actingViaFromHeader,
} from "./acting";

export const ASSISTANT_CALL_HEADER = "x-houston-assistant-call";

const PROOF = randomBytes(32).toString("base64url");
const PROOF_BYTES = Buffer.from(PROOF);

export function assistantCallHeaders(): Record<string, string> {
  return { [ASSISTANT_CALL_HEADER]: PROOF };
}

function fromLoopback(req: IncomingMessage): boolean {
  const address = req.socket?.remoteAddress ?? "";
  const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (isIP(v4) === 4) return v4.startsWith("127.");
  return address === "::1";
}

function carriesProof(req: IncomingMessage): boolean {
  const raw = req.headers[ASSISTANT_CALL_HEADER];
  if (typeof raw !== "string") return false;
  const offered = Buffer.from(raw);
  return (
    offered.length === PROOF_BYTES.length &&
    timingSafeEqual(offered, PROOF_BYTES)
  );
}

export function isAssistantRequest(
  deps: { gatewayFronted?: boolean },
  req: IncomingMessage,
): boolean {
  if (deps.gatewayFronted) {
    return (
      actingViaFromHeader(req.headers[ACTING_AS_HEADER]) ===
      ACTING_VIA_ASSISTANT
    );
  }
  return fromLoopback(req) && carriesProof(req);
}
