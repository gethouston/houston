import { EngineError } from "@houston/runtime-client";
import { PROVIDER_LOGIN_PORT_BUSY_ERROR } from "@houston-ai/core";
import { emitEvent } from "../bus";

const SENTINEL_BY_KIND: Record<string, string> = {
  codex_callback_port_busy: PROVIDER_LOGIN_PORT_BUSY_ERROR,
};

export function surfaceTypedLoginFailure(
  displayProvider: string,
  err: unknown,
): boolean {
  if (!(err instanceof EngineError)) return false;
  let parsed: { error?: unknown; kind?: unknown };
  try {
    parsed = JSON.parse(err.body) as { error?: unknown; kind?: unknown };
  } catch {
    return false;
  }
  if (typeof parsed.kind !== "string" || typeof parsed.error !== "string")
    return false;
  emitEvent("ProviderLoginComplete", {
    provider: displayProvider,
    success: false,
    error: SENTINEL_BY_KIND[parsed.kind] ?? parsed.error,
  });
  return true;
}
