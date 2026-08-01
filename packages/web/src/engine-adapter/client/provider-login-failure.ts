import { EngineError } from "@houston/runtime-client";
import { PROVIDER_LOGIN_PORT_BUSY_ERROR } from "@houston-ai/core";
import { emitEvent } from "../bus";

/** Typed runtime failure kinds the app localizes: the raw runtime message is
 *  swapped for the matching `@houston-ai/core` sentinel so the toast mapping
 *  (app/src/lib/provider-login-error.ts) can match by value, exactly like the
 *  client-side timeout sentinels. Unknown kinds pass the real message through
 *  verbatim (beta policy). */
const SENTINEL_BY_KIND: Record<string, string> = {
  codex_callback_port_busy: PROVIDER_LOGIN_PORT_BUSY_ERROR,
};

/**
 * Surface a login-launch failure the runtime tagged with a stable `kind` (today:
 * the OpenAI/Codex sign-in port 1455 is held by another app) as a normal
 * `ProviderLoginComplete` failure — the same channel the completion toast and
 * the reconnect card already read — so its actionable message reaches the user.
 * A raw `startLogin` rejection is otherwise flattened to a generic "sign-in
 * failed" toast (the REST body's real `error` string never reaches the caller).
 * Returns true when handled (the caller must NOT rethrow); false to rethrow
 * unchanged, preserving every untyped failure's existing path.
 */
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
