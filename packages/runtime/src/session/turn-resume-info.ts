import { TURN_MODES, type TurnMode } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import { loadConversation } from "../store/conversation-file";
import { type ActingContext, credentialScopeKeyFor } from "./acting-context";
import type { TurnPin } from "./exec-turn";
import type { InflightTurnMarker } from "./turn-inflight-marker";

/**
 * What an interrupted turn needs in order to be RUN AGAIN by the engine that
 * finds its marker at boot (PRODUCT-1785). Persisted on the in-flight marker
 * because the process that could answer these questions is dead: its pinned
 * model and its credential scope are gone with it, and a resume that ran on
 * the workspace default would silently switch the user's model mid-task.
 */
export interface TurnResumeInfo {
  pin?: TurnPin;
  acting?: PersistedActing;
}

/**
 * The persistable half of an {@link ActingContext}. `actingAs` is deliberately
 * NOT here: it is a short-lived gateway token that would be expired (and is a
 * credential) by the time the next process reads the marker off disk. The
 * resume therefore runs on the same credential SCOPE the original turn used,
 * with no forwarded acting authority. `localModelTransport` is a live object,
 * not data, so it cannot survive a restart either.
 */
export interface PersistedActing {
  actingUser?: string;
  credentialScopeKey?: string;
  authPath?: string;
}

/** One interrupted turn the boot settle decided to run again. */
export interface ResumeRequest {
  conversationId: string;
  /** The interrupted turn's id — the resume turn records it as `resumeOf`. */
  turnId: string;
  /** The model-facing text of the original user message, verbatim. */
  text: string;
  displayText?: string;
  mentions?: ChatMessage["mentions"];
  pin?: TurnPin;
  acting?: PersistedActing;
}

/**
 * The resume payload for a starting turn. ALWAYS an object, even an empty one:
 * its presence on the marker is how the boot settle tells a turn started by an
 * engine that can resume from one started by an older build (a desktop turn
 * with no pin and no acting identity has nothing to carry and is still
 * perfectly resumable).
 */
export function buildTurnResumeInfo(
  pin?: TurnPin,
  acting?: ActingContext,
): TurnResumeInfo {
  const persistedActing = persistableActing(acting);
  const persistedPin = persistablePin(pin);
  return {
    ...(persistedPin ? { pin: persistedPin } : {}),
    ...(persistedActing ? { acting: persistedActing } : {}),
  };
}

/** The acting context a resume runs under, rebuilt from the marker. */
export function actingFromPersisted(
  acting: PersistedActing | undefined,
): ActingContext | undefined {
  if (!acting) return undefined;
  return { ...acting };
}

/**
 * Read an untrusted marker field. A marker written by an older engine (or a
 * shape we no longer understand) yields undefined — the marker itself stays
 * valid and settles as it always did, it simply cannot be resumed.
 */
export function parseTurnResumeInfo(
  value: unknown,
): TurnResumeInfo | undefined {
  if (!isRecord(value)) return undefined;
  const pin = isRecord(value.pin) ? parsePin(value.pin) : undefined;
  const acting = isRecord(value.acting)
    ? persistableActing(value.acting as ActingContext)
    : undefined;
  return { ...(pin ? { pin } : {}), ...(acting ? { acting } : {}) };
}

/**
 * The resume request for an interrupted turn, or null when it must not be
 * resumed. Three refusals, each deliberate:
 *
 *  - `resumeOf` set: THIS turn was itself a resume that died. Resuming it
 *    again is the loop — one automatic resume per interrupted turn, ever.
 *  - no `resume` payload: a marker from an engine that predates this, so the
 *    pin and credential scope are unknown and a resume would run on the wrong
 *    model or the wrong account.
 *  - no user message on disk for the turn id: nothing to say to the model.
 */
export function resumeRequestFor(
  conversationsDir: string,
  marker: InflightTurnMarker,
): ResumeRequest | null {
  if (marker.resumeOf !== undefined || !marker.resume) return null;
  const conv = loadConversation(conversationsDir, marker.conversationId);
  const original = conv?.messages.find(
    (m) => m.role === "user" && m.turnId === marker.turnId,
  );
  if (!original?.content) return null;
  return {
    conversationId: marker.conversationId,
    turnId: marker.turnId,
    text: original.content,
    ...(original.displayText !== undefined
      ? { displayText: original.displayText }
      : {}),
    ...(original.mentions !== undefined ? { mentions: original.mentions } : {}),
    ...(marker.resume.pin ? { pin: marker.resume.pin } : {}),
    ...(marker.resume.acting ? { acting: marker.resume.acting } : {}),
  };
}

function persistableActing(
  acting: ActingContext | undefined,
): PersistedActing | undefined {
  const out: PersistedActing = {};
  if (typeof acting?.actingUser === "string")
    out.actingUser = acting.actingUser;
  // The scope key is RESOLVED here rather than copied: on a gateway turn it is
  // derived from `actingAs` deep inside the request wrap, and the token itself
  // must never reach the disk. Persisting the derived key is what keeps the
  // resume on the same member's credentials instead of the team account.
  if (typeof acting?.credentialScopeKey === "string")
    out.credentialScopeKey = acting.credentialScopeKey;
  else if (typeof acting?.actingAs === "string")
    out.credentialScopeKey = credentialScopeKeyFor(acting.actingAs);
  if (typeof acting?.authPath === "string") out.authPath = acting.authPath;
  return Object.keys(out).length > 0 ? out : undefined;
}

function persistablePin(pin: TurnPin | undefined): TurnPin | undefined {
  return pin ? parsePin(pin as Record<string, unknown>) : undefined;
}

function parsePin(raw: Record<string, unknown>): TurnPin | undefined {
  const out: TurnPin = {};
  for (const key of ["provider", "model", "effort"] as const) {
    const value = raw[key];
    if (typeof value === "string" || value === null) out[key] = value;
  }
  if (TURN_MODES.includes(raw.mode as TurnMode))
    out.mode = raw.mode as TurnMode;
  return Object.keys(out).length > 0 ? out : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
