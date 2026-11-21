import type { ProviderError } from "@houston/runtime-client";
import { quotaExhaustedActive } from "../auth/credential-health";
import { currentCredentialScope } from "../session/acting-context";
import { classifyProviderError, stampCredentialScope } from "./provider-error";

const CODEX_PROVIDER = "openai-codex";

const REASON_PHRASES: ReadonlySet<string> = new Set([
  "bad request",
  "not found",
  "forbidden",
  "request failed",
]);

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

const MEMORY_TTL_MS = 30 * 60 * 1000;

const MEMORY_CAP = 64;

const remembered = new Map<string, { error: RememberedRefusal; at: number }>();

function gateKey(model: string): string {
  return `${currentCredentialScope().key}:gate:${model}`;
}

function quotaKey(): string {
  return `${currentCredentialScope().key}:quota`;
}

export function noteCodexRefusal(error: ProviderError): void {
  if (error.provider !== CODEX_PROVIDER) return;
  if (error.kind !== "model_unavailable" && error.kind !== "quota_exhausted")
    return;
  const key =
    error.kind === "model_unavailable" ? gateKey(error.model) : quotaKey();
  remembered.set(key, { error, at: Date.now() });
  pruneMemory();
}

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
  retryErrorMessage?: string | null;
}

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

function fromMemory(input: TerseRefusalInput): RememberedRefusal | null {
  const gate = input.model ? recall(gateKey(input.model)) : null;
  if (gate) return gate;
  const quota = recall(quotaKey());
  if (quota?.kind === "quota_exhausted")
    return { ...quota, model: input.model };
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

export function resetCodexRefusalMemory(): void {
  remembered.clear();
}
