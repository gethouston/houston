import type { IncomingMessage } from "node:http";
import type { ActivityContributor } from "@houston/protocol";
import type { UserId } from "../domain/types";

export const ACTING_AS_HEADER = "x-houston-acting-as";

const PREFIX = "acting-v1";

function decodeActingPayload(
  value: unknown,
): { sub?: unknown; name?: unknown; dlg?: unknown; via?: unknown } | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1]) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      sub?: unknown;
      name?: unknown;
      dlg?: unknown;
      via?: unknown;
    };
  } catch {
    return null;
  }
}

export function actingDelegatorFromHeader(value: unknown): string | undefined {
  const payload = decodeActingPayload(value);
  return payload &&
    typeof payload.sub === "string" &&
    payload.sub &&
    typeof payload.dlg === "string" &&
    payload.dlg
    ? payload.dlg
    : undefined;
}

export const ACTING_VIA_ASSISTANT = "assistant";

export const ACTING_VIA_API = "api";

export function actingViaFromHeader(value: unknown): string | undefined {
  const payload = decodeActingPayload(value);
  return payload &&
    typeof payload.sub === "string" &&
    payload.sub &&
    typeof payload.via === "string" &&
    payload.via
    ? payload.via
    : undefined;
}

export function actingSubFromHeader(
  value: string | string[] | undefined,
): string | undefined {
  const payload = decodeActingPayload(value);
  return payload && typeof payload.sub === "string" && payload.sub
    ? payload.sub
    : undefined;
}

export function actingAuthorFromHeader(
  value: unknown,
): ActivityContributor | null {
  const payload = decodeActingPayload(value);
  if (!payload || typeof payload.sub !== "string" || !payload.sub) return null;
  return typeof payload.name === "string" && payload.name
    ? { user_id: payload.sub, name: payload.name }
    : { user_id: payload.sub };
}

interface ActingDeps {
  gatewayFronted?: boolean;
  ownerSub?: string;
}

export function actingAuthorFor(
  deps: ActingDeps,
  req: IncomingMessage,
): ActivityContributor | null {
  return deps.gatewayFronted
    ? actingAuthorFromHeader(req.headers[ACTING_AS_HEADER])
    : null;
}

export function routineActorFor(
  deps: ActingDeps,
  req: IncomingMessage,
  userId: UserId,
): string | undefined {
  return deps.gatewayFronted
    ? (actingSubFromHeader(req.headers[ACTING_AS_HEADER]) ?? deps.ownerSub)
    : userId;
}
