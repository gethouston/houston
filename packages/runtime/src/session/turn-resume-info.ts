import { TURN_MODES, type TurnMode } from "@houston/protocol";
import { type ActingContext, credentialScopeKeyFor } from "./acting-context";
import type { TurnPin } from "./exec-turn";
import type { ProvidedContext } from "./workspace-context";

export interface TurnResumeInfo {
  pin?: TurnPin;
  acting?: PersistedActing;
  context?: ProvidedContext;
}

export interface PersistedActing {
  actingUser?: string;
  credentialScopeKey?: string;
  authPath?: string;
}

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

export function actingFromPersisted(
  acting: PersistedActing | undefined,
): ActingContext | undefined {
  if (!acting) return undefined;
  return { ...acting };
}

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
  if (typeof raw.timezone === "string") out.timezone = raw.timezone;
  if (typeof raw.nextStepSuggestions === "boolean")
    out.nextStepSuggestions = raw.nextStepSuggestions;
  if (TURN_MODES.includes(raw.mode as TurnMode))
    out.mode = raw.mode as TurnMode;
  return Object.keys(out).length > 0 ? out : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
