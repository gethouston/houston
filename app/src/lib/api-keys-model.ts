import type { ApiKey, Capabilities } from "@houston/engine-adapter";

export const MAX_KEY_NAME_LENGTH = 100;

export function apiKeysSupported(caps: Capabilities | null): boolean {
  return caps?.apiKeys === true;
}

export function isValidKeyName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_KEY_NAME_LENGTH;
}

export function isKeyLimitError(err: unknown): boolean {
  const e = err as { status?: unknown; body?: unknown } | null | undefined;
  if (e?.status !== 400) return false;
  const code = (e.body as { code?: unknown } | null | undefined)?.code;
  return code === "key_limit";
}

export function isKeyGoneError(err: unknown): boolean {
  const e = err as { status?: unknown } | null | undefined;
  return e?.status === 404;
}

export type LastUsedState = { kind: "never" } | { kind: "at"; atMs: number };

export function lastUsedState(key: Pick<ApiKey, "lastUsedAt">): LastUsedState {
  if (!key.lastUsedAt) return { kind: "never" };
  const atMs = Date.parse(key.lastUsedAt);
  return Number.isNaN(atMs) ? { kind: "never" } : { kind: "at", atMs };
}
