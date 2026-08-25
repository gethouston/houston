import { normalizeTurnMode, parseMentions } from "@houston/protocol";
import type { ServedCredential } from "../auth/auth-file";
import { assertRoutineEventBounds } from "./parse-routine-events";
import type { TurnRequest } from "./types";

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PREFIX = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid '${field}'`);
  }
  // SAFETY: the object/array check establishes the string-keyed JSON record
  // shape; every consumed property is parsed again below.
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error(`invalid '${field}'`);
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Validate an untyped body into a TurnRequest. Throws with the real reason. */
export function parseTurnRequest(body: unknown): TurnRequest {
  const b = body as Record<string, unknown>;
  if (!b || typeof b !== "object")
    throw new Error("body must be a JSON object");
  for (const field of ["workspaceId", "agentId", "conversationId"] as const) {
    if (typeof b[field] !== "string" || !ID.test(b[field] as string)) {
      throw new Error(`invalid '${field}'`);
    }
  }
  // Routine turns carry no text on the wire: the worker derives the prompt
  // from the hydrated routine file (the envelope's routine.id is the payload).
  if (typeof b.text !== "string" || (!b.text.length && b.routine === undefined))
    throw new Error("missing 'text'");
  const prefix = b.gcsPrefix;
  if (
    typeof prefix !== "string" ||
    !PREFIX.test(prefix) ||
    prefix.includes("..")
  ) {
    throw new Error("invalid 'gcsPrefix'");
  }
  let credential: ServedCredential | null = null;
  if (b.credential != null) {
    const c = b.credential as Record<string, unknown>;
    if (
      typeof c.provider !== "string" ||
      typeof c.access !== "string" ||
      typeof c.expires !== "number"
    ) {
      throw new Error("invalid 'credential'");
    }
    credential = {
      provider: c.provider,
      access: c.access,
      expires: c.expires,
      accountId: typeof c.accountId === "string" ? c.accountId : null,
      kind: c.kind === "api_key" ? "api_key" : "oauth",
      // Copilot Enterprise routes to a per-tenant API host; dropping it here
      // would silently turn an enterprise credential into a github.com one.
      ...(typeof c.enterpriseUrl === "string" && c.enterpriseUrl
        ? { enterpriseUrl: c.enterpriseUrl }
        : {}),
    };
  }
  if (b.turnId !== undefined && (!nonEmpty(b.turnId) || !ID.test(b.turnId))) {
    throw new Error("invalid 'turnId'");
  }
  if (b.hostToken !== undefined && !nonEmpty(b.hostToken)) {
    throw new Error("invalid 'hostToken'");
  }
  let actingAs: TurnRequest["actingAs"];
  if (b.actingAs !== undefined) {
    const acting = record(b.actingAs, "actingAs");
    exactKeys(acting, ["userId", "name"], "actingAs");
    if (
      !nonEmpty(acting.userId) ||
      (acting.name !== undefined && !nonEmpty(acting.name))
    ) {
      throw new Error("invalid 'actingAs'");
    }
    actingAs = {
      userId: acting.userId,
      ...(acting.name ? { name: acting.name } : {}),
    };
  }
  if (b.shadow !== undefined && typeof b.shadow !== "boolean") {
    throw new Error("invalid 'shadow'");
  }
  for (const field of ["workspaceContext", "userContext"] as const) {
    if (b[field] !== undefined && typeof b[field] !== "string") {
      throw new Error(`invalid '${field}'`);
    }
  }
  if (
    b.turnlogSeqStart !== undefined &&
    (typeof b.turnlogSeqStart !== "number" ||
      !Number.isSafeInteger(b.turnlogSeqStart) ||
      b.turnlogSeqStart < 1)
  ) {
    throw new Error("invalid 'turnlogSeqStart'");
  }
  let claim: TurnRequest["claim"];
  if (b.claim !== undefined) {
    const parsed = record(b.claim, "claim");
    exactKeys(parsed, ["id", "bootId", "token", "heartbeatUrl"], "claim");
    if (
      !nonEmpty(parsed.id) ||
      !nonEmpty(parsed.bootId) ||
      !nonEmpty(parsed.token) ||
      !nonEmpty(parsed.heartbeatUrl)
    ) {
      throw new Error("invalid 'claim'");
    }
    claim = {
      id: parsed.id,
      bootId: parsed.bootId,
      token: parsed.token,
      heartbeatUrl: parsed.heartbeatUrl,
    };
  }
  if (Boolean(claim) !== Boolean(b.hostToken)) {
    throw new Error("claim and hostToken must be configured together");
  }
  let routine: TurnRequest["routine"];
  if (b.routine !== undefined) {
    const parsed = record(b.routine, "routine");
    exactKeys(parsed, ["id", "events"], "routine");
    if (!nonEmpty(parsed.id)) {
      throw new Error("invalid 'routine'");
    }
    if (!claim) {
      throw new Error("routine turns require a claim");
    }
    let events: NonNullable<TurnRequest["routine"]>["events"];
    if (parsed.events !== undefined) {
      if (!Array.isArray(parsed.events)) {
        throw new Error("invalid 'routine.events'");
      }
      events = parsed.events.map((entry) => {
        const event = record(entry, "routine.events");
        if (!nonEmpty(event.id) || !nonEmpty(event.trigger_slug)) {
          throw new Error("invalid 'routine.events'");
        }
        return {
          id: event.id,
          trigger_slug: event.trigger_slug,
          payload: (event as Record<string, unknown>).payload,
        };
      });
      assertRoutineEventBounds(events);
    }
    routine = { id: parsed.id, ...(events ? { events } : {}) };
  }
  const poolPrefix = prefix.split("/");
  if (
    claim &&
    (poolPrefix.length !== 3 ||
      poolPrefix[0] !== "ws" ||
      !poolPrefix[1] ||
      !poolPrefix[2])
  ) {
    throw new Error("claimed turn has invalid 'gcsPrefix'");
  }
  return {
    workspaceId: b.workspaceId as string,
    agentId: b.agentId as string,
    conversationId: b.conversationId as string,
    text: b.text,
    nonce: typeof b.nonce === "string" ? b.nonce : undefined,
    gcsPrefix: prefix,
    credential,
    provider: nonEmpty(b.provider) ? b.provider : undefined,
    model: typeof b.model === "string" ? b.model : undefined,
    effort: typeof b.effort === "string" ? b.effort : undefined,
    // Never trust the wire: only the known mode literals ("plan", "auto") pass;
    // anything else normalizes to "execute".
    mode: normalizeTurnMode(b.mode),
    displayText: typeof b.displayText === "string" ? b.displayText : undefined,
    // Same "never trust the wire" posture: junk entries are dropped and an
    // empty list becomes nothing, so a bad sidecar never costs the user a turn.
    mentions: parseMentions(b.mentions),
    turnId: typeof b.turnId === "string" ? b.turnId : undefined,
    hostToken: typeof b.hostToken === "string" ? b.hostToken : undefined,
    actingAs,
    shadow: typeof b.shadow === "boolean" ? b.shadow : undefined,
    workspaceContext:
      typeof b.workspaceContext === "string" ? b.workspaceContext : undefined,
    userContext: typeof b.userContext === "string" ? b.userContext : undefined,
    turnlogSeqStart:
      typeof b.turnlogSeqStart === "number" ? b.turnlogSeqStart : undefined,
    routine,
    claim,
  };
}
