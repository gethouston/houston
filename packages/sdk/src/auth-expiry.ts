import { EngineError } from "@houston/runtime-client";
import type { ScopeStore } from "./store";

/** The SDK event emitted once per token value when a request is rejected 401. */
export const TOKEN_EXPIRED_EVENT = "session/tokenExpired";

/**
 * Whether `err` is an engine 401. Matches the runtime-client {@link EngineError}
 * and duck-types a `{ status: 401 }` shape so an error that crossed the
 * `dispatch` boundary (and lost its prototype) still classifies.
 */
export function isUnauthorized(err: unknown): boolean {
  if (err instanceof EngineError) return err.status === 401;
  if (typeof err === "object" && err !== null) {
    return (err as { status?: unknown }).status === 401;
  }
  return false;
}

/** Classifies engine 401s and emits `session/tokenExpired`, deduped by token value. */
export interface AuthExpiryNotifier {
  /**
   * Update the token the once-per-value dedupe and staleness check key on. The
   * session module calls this on construction, hydrate, and every `setToken`, so
   * a fresh token re-arms the signal and a stale request's 401 can be spotted.
   */
  setToken(token: string | null): void;
  /**
   * Report a 401 for a request that carried `tokenUsed` (the token stamped on
   * that request, or `null` if it went out tokenless). Emits `tokenExpired` iff
   * the 401 is attributable to the *current* token and has not already fired for
   * that value; a stale (`tokenUsed !== current`) or tokenless 401 is suppressed.
   * Passing no argument (a caller that lacks the request's token identity) is
   * suppressed — {@link createAuthFetch} is the authoritative reporter.
   */
  notifyExpired(tokenUsed?: string | null): void;
}

/**
 * Build the notifier bound to `store`. Dedupe state is per instance, i.e. per
 * SDK — one shared notifier across all modules.
 */
export function createAuthExpiryNotifier(
  store: ScopeStore,
): AuthExpiryNotifier {
  let token: string | null = null;
  let firedForToken: string | null = null;
  let hasFired = false;

  return {
    setToken(next: string | null): void {
      token = next;
    },
    notifyExpired(tokenUsed?: string | null): void {
      if (tokenUsed === undefined) return;
      if (tokenUsed === null) return;
      if (tokenUsed !== token) return;
      if (hasFired && firedForToken === tokenUsed) return;
      hasFired = true;
      firedForToken = tokenUsed;
      store.emitEvent({ type: TOKEN_EXPIRED_EVENT });
    },
  };
}
