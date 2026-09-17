import { TURN_MODES, type TurnMode } from "@houston/protocol";
import { type ActingContext, credentialScopeKeyFor } from "./acting-context";
import type { TurnPin } from "./exec-turn";
import type { ProvidedContext } from "./workspace-context";

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
  /**
   * The gateway-supplied workspace/user blobs the original turn ran with
   * (workspace-context.ts). On cloud they REPLACE the local WORKSPACE.md /
   * USER.md, and nothing on the volume can rebuild them — a resume that
   * dropped them would silently run the turn with a different system prompt
   * than the one the user's request was answered under.
   */
  context?: ProvidedContext;
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
  context?: ProvidedContext,
): TurnResumeInfo {
  const persistedActing = persistableActing(acting);
  const persistedPin = persistablePin(pin);
  const persistedContext = parseProvidedContext(context);
  return {
    ...(persistedPin ? { pin: persistedPin } : {}),
    ...(persistedActing ? { acting: persistedActing } : {}),
    ...(persistedContext ? { context: persistedContext } : {}),
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
  const context = parseProvidedContext(value.context);
  return {
    ...(pin ? { pin } : {}),
    ...(acting ? { acting } : {}),
    ...(context ? { context } : {}),
  };
}

/** Two strings or nothing — a half-written blob pair is not a context. */
function parseProvidedContext(value: unknown): ProvidedContext | undefined {
  if (!isRecord(value)) return undefined;
  const { workspace, user } = value;
  if (typeof workspace !== "string" || typeof user !== "string")
    return undefined;
  return { workspace, user };
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
