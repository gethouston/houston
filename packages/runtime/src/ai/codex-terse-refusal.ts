import type { ProviderError } from "@houston/runtime-client";
import { quotaExhaustedActive } from "../auth/credential-health";
import { currentCredentialScope } from "../session/acting-context";
import { classifyProviderError, stampCredentialScope } from "./provider-error";

/**
 * ChatGPT's Codex gateway sometimes refuses a request with a TERSE body
 * instead of its usual explanation: `{"detail":"Bad Request"}` (FastAPI's
 * default 400), a bare `Not Found` (pi's statusText fallback for an empty
 * 404), or a whole HTML error page. pi's SSE path hands the body over as the
 * turn's `errorMessage` with no HTTP status, so the classifier degrades to
 * `unknown`: the report-bug card, and a Sentry error per turn.
 *
 * The terse form is never a NEW failure. In every fleet sample the same
 * account, same model, got the explained body minutes or retry attempts
 * earlier: "'gpt-5.4-mini' is not supported when using Codex with a ChatGPT
 * account" alternating with `Bad Request` on a routine firing every minute;
 * "You have hit your ChatGPT usage limit" on pi's retry attempts 1-3 and
 * `Bad Request` on the final one (HOUSTON-APP-56R, PRODUCT-1832). Probing the
 * gateway directly answers the explained 400 for every request shape, so the
 * terse body is OpenAI's, not something in the request.
 *
 * So a terse refusal is RESOLVED from what the same account was last refused
 * with: this turn's retry attempts first, then the recent refusal memory (a
 * plan gate per model, a usage limit per provider), then the persisted
 * out-of-quota mark. Only the two account-standing kinds are borrowed
 * (`model_unavailable`, `quota_exhausted`): their cards' remedies hold for the
 * terse refusal exactly as for the explained one. Nothing remembered leaves
 * the turn `unknown` on the card, logged as a warning (provider-error-log.ts).
 */

const CODEX_PROVIDER = "openai-codex";

/** The bare HTTP reason phrases the gateway (or pi's fallback) answers with. */
const REASON_PHRASES: ReadonlySet<string> = new Set([
  "bad request",
  "not found",
  "forbidden",
  "request failed",
]);

/** Whether this failure text is one of ChatGPT's reason-less refusal shapes. */
export function isCodexTerseRefusal(
  provider: string,
  message: string,
): boolean {
  if (provider !== CODEX_PROVIDER) return false;
  const text = message.trim();
  const lower = text.toLowerCase();
  if (REASON_PHRASES.has(lower)) return true;
  if (lower.startsWith("<html") || lower.startsWith("<!doctype html"))
    return true;
  if (!text.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    return (
      typeof parsed.detail === "string" &&
      REASON_PHRASES.has(parsed.detail.trim().toLowerCase())
    );
  } catch {
    return false;
  }
}

type RememberedRefusal = Extract<
  ProviderError,
  { kind: "model_unavailable" | "quota_exhausted" }
>;

/**
 * How long an explained refusal vouches for a later terse one. A usage limit
 * also honours its own `resets_at`; half an hour keeps a plan upgrade from
 * being misread for more than a routine cycle or two.
 */
const MEMORY_TTL_MS = 30 * 60 * 1000;

/** Bound on remembered refusals: keys are (scope, model) pairs, so a handful. */
const MEMORY_CAP = 64;

const remembered = new Map<string, { error: RememberedRefusal; at: number }>();

function gateKey(model: string): string {
  return `${currentCredentialScope().key}:gate:${model}`;
}

function quotaKey(): string {
  return `${currentCredentialScope().key}:quota`;
}

/**
 * Remember an EXPLAINED Codex refusal so a later terse one can borrow its
 * reading. Called with every classified turn failure; anything but a Codex
 * plan gate or usage limit is ignored.
 */
export function noteCodexRefusal(error: ProviderError): void {
  if (error.provider !== CODEX_PROVIDER) return;
  if (error.kind !== "model_unavailable" && error.kind !== "quota_exhausted")
    return;
  const key =
    error.kind === "model_unavailable" ? gateKey(error.model) : quotaKey();
  remembered.set(key, { error, at: Date.now() });
  pruneMemory();
}

// Expiry is checked on recall; the cap alone bounds the map (insertion order).
function pruneMemory(): void {
  while (remembered.size > MEMORY_CAP) {
    const oldest = remembered.keys().next().value;
    if (oldest === undefined) break;
    remembered.delete(oldest);
  }
}

function recall(key: string): RememberedRefusal | null {
  const entry = remembered.get(key);
  if (!entry) return null;
  const expired =
    Date.now() - entry.at > MEMORY_TTL_MS ||
    (entry.error.kind === "quota_exhausted" &&
      entry.error.resets_at !== null &&
      Date.parse(entry.error.resets_at) <= Date.now());
  if (expired) {
    remembered.delete(key);
    return null;
  }
  return entry.error;
}

export interface TerseRefusalInput {
  provider: string;
  model: string | null;
  message: string;
  /** The failure text of pi's last auto-retry attempt in this same turn. */
  retryErrorMessage?: string | null;
}

/**
 * The explained reading of a terse Codex refusal, or null when nothing this
 * account was recently refused with can vouch for one. The returned error
 * keeps the terse body in its message, followed by the explanation it
 * borrowed, so the log line and the raw-output panel still show both.
 */
export function resolveCodexTerseRefusal(
  input: TerseRefusalInput,
): ProviderError | null {
  if (!isCodexTerseRefusal(input.provider, input.message)) return null;
  const borrowed = fromRetryAttempt(input) ?? fromMemory(input);
  if (!borrowed) return null;
  return stampCredentialScope({
    ...borrowed,
    message: `${input.message.trim()} (ChatGPT's terse refusal; the same account was last refused with: ${borrowed.message})`,
  });
}

/** pi retried inside this turn and an earlier attempt carried the explanation. */
function fromRetryAttempt(input: TerseRefusalInput): RememberedRefusal | null {
  const retry = input.retryErrorMessage?.trim();
  if (!retry || isCodexTerseRefusal(input.provider, retry)) return null;
  const classified = classifyProviderError({
    provider: input.provider,
    model: input.model,
    message: retry,
  });
  if (
    classified.kind !== "model_unavailable" &&
    classified.kind !== "quota_exhausted"
  )
    return null;
  return classified;
}

/** A recent explained refusal under the same acting identity. */
function fromMemory(input: TerseRefusalInput): RememberedRefusal | null {
  const gate = input.model ? recall(gateKey(input.model)) : null;
  if (gate) return gate;
  const quota = recall(quotaKey());
  if (quota?.kind === "quota_exhausted")
    return { ...quota, model: input.model };
  // The persisted mark outlives a pod restart (auth/provider-marks.ts); it
  // carries no reset instant, so the card falls back to open-ended copy.
  if (quotaExhaustedActive(input.provider)) {
    return {
      kind: "quota_exhausted",
      provider: input.provider,
      model: input.model,
      scope: "unknown",
      resets_at: null,
      message: "the account is marked out of ChatGPT quota",
    };
  }
  return null;
}

/** Tests only: forget every remembered refusal. */
export function resetCodexRefusalMemory(): void {
  remembered.clear();
}
