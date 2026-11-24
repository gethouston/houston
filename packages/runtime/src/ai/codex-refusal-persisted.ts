import type { ProviderError } from "@houston/runtime-client";
import {
  CODEX_REFUSALS_FILE,
  readConversationMark,
  writeConversationMark,
} from "../session/conversation-marks";

export const CODEX_PROVIDER = "openai-codex";

export type RememberedRefusal = Extract<
  ProviderError,
  { kind: "model_unavailable" | "quota_exhausted" }
>;

const MEMORY_TTL_MS = 30 * 60 * 1000;

export const MEMORY_CAP = 64;

export interface Remembered {
  error: RememberedRefusal;
  at: number;
}

export function refusalExpired(entry: Remembered, now: number): boolean {
  return (
    now - entry.at > MEMORY_TTL_MS ||
    (entry.error.kind === "quota_exhausted" &&
      entry.error.resets_at !== null &&
      Date.parse(entry.error.resets_at) <= now)
  );
}

function isRememberedRefusal(value: unknown): value is RememberedRefusal {
  if (typeof value !== "object" || value === null) return false;
  if (!("kind" in value) || !("provider" in value) || !("message" in value))
    return false;
  if (value.provider !== CODEX_PROVIDER || typeof value.message !== "string")
    return false;
  if (value.kind === "model_unavailable")
    return (
      "model" in value &&
      typeof value.model === "string" &&
      "reason" in value &&
      typeof value.reason === "string" &&
      "suggested_fallback" in value &&
      (value.suggested_fallback === null ||
        typeof value.suggested_fallback === "string")
    );
  return (
    value.kind === "quota_exhausted" &&
    "model" in value &&
    (value.model === null || typeof value.model === "string") &&
    "scope" in value &&
    typeof value.scope === "string" &&
    "resets_at" in value &&
    (value.resets_at === null || typeof value.resets_at === "string")
  );
}

function isRemembered(value: unknown): value is Remembered {
  return (
    typeof value === "object" &&
    value !== null &&
    "at" in value &&
    typeof value.at === "number" &&
    Number.isFinite(value.at) &&
    "error" in value &&
    isRememberedRefusal(value.error)
  );
}

export function persistedRefusals(): Map<string, Remembered> {
  const raw = readConversationMark(CODEX_REFUSALS_FILE);
  const entries = new Map<string, Remembered>();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return entries;
  for (const [key, value] of Object.entries(raw))
    if (isRemembered(value)) entries.set(key, value);
  return entries;
}

export function persistRefusal(key: string, entry: Remembered): void {
  const now = Date.now();
  const kept = [...persistedRefusals()].filter(
    ([other, value]) => other !== key && !refusalExpired(value, now),
  );
  writeConversationMark(
    CODEX_REFUSALS_FILE,
    Object.fromEntries([...kept.slice(-(MEMORY_CAP - 1)), [key, entry]]),
  );
}
