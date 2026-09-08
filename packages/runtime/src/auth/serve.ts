import { currentCredentialScope } from "../session/acting-context";
import { runServedSync } from "./serve-sync-run";

export {
  anthropicServedHere,
  resetAnthropicServedHereForTest,
  serveModeOn,
} from "./serve-context";
export { scrubRefreshTokens } from "./serve-scrub";

/**
 * Connect-once serve mode (security Gate #2: access-token-only).
 *
 * The user's subscription credential lives centrally in the control plane (one
 * per workspace, refreshed there — the control plane is the ONLY holder of the
 * refresh token). Before every turn the sandbox pulls a fresh short-TTL ACCESS
 * token and writes it to auth.json with an empty refresh field, so a
 * prompt-injected agent that somehow read auth.json gets a token worth minutes,
 * not a permanent account takeover.
 *
 * The one exception is the device-code connect flow: pi's own login writes the
 * full credential (access + refresh) locally. Serve sync must not overwrite that
 * refresh-bearing entry with an older central access token while capture is in
 * progress. The control plane captures it into the central store immediately
 * afterwards and then calls POST /auth/scrub-refresh?provider=<id>, which
 * rewrites THAT provider's entry with refresh="" (PRODUCT-1320); normal serving
 * resumes after that scrub. A lost scrub is self-healed by the sync itself
 * (capture-settlement.ts, PRODUCT-1318).
 *
 * Best-effort on sync: a transient control-plane blip leaves the existing
 * (still-valid) auth.json in place; a missing connection surfaces downstream as
 * the runtime's normal "No provider connected" error.
 */

/**
 * Pull the workspace's central credentials from the control plane into auth.json
 * (access token / API key only). A workspace can have one credential per provider
 * (e.g. Codex AND Bedrock), so this syncs EVERY known provider and applies each
 * that the host serves — hydrating a fresh or just-woken runtime no matter which
 * provider the next turn uses. Returns the providers that were applied; an empty
 * result means the workspace hasn't connected anything yet.
 *
 * Concurrent callers SHARE one in-flight sync. GET /auth/status and GET /providers
 * hydrate too (so a brand-new agent's model picker shows the workspace's connected
 * providers before its first turn — HOU-573/HOU-680), and the picker fires one
 * status request PER provider in parallel. Without sharing, those N requests would
 * run N syncs that each rewrite auth.json at once — a write race. A turn and a
 * status poll can also overlap. One sync, one auth.json write, every caller gets
 * the same result.
 *
 * Sharing is PER ACTING IDENTITY (HOU-976): two members' syncs write two
 * different files and must not collapse into one another's result, so the
 * in-flight promise is keyed by scope.
 */
const serveSyncInFlight = new Map<string, Promise<string[]>>();

export function syncServedCredential(): Promise<string[]> {
  const { key } = currentCredentialScope();
  const inFlight = serveSyncInFlight.get(key);
  if (inFlight) return inFlight;
  const run = runServedSync().finally(() => {
    serveSyncInFlight.delete(key);
  });
  serveSyncInFlight.set(key, run);
  return run;
}

/**
 * Best-effort wrapper for read routes and turn start: hydration must never fail
 * the request it precedes. A missing connection still surfaces downstream as
 * the runtime's normal "No provider connected" when nothing was applied.
 *
 * Also what the credential store's empty-refresh guard runs (PRODUCT-1317): an
 * expiring access-only entry is re-served through THIS single-flighted sync
 * before pi's expiry check can route it into a refresh. The safe variant on
 * purpose — a hydration failure must never fail the credential read it precedes
 * (the modify mask still guards), and it already logs the failure.
 */
export async function syncServedCredentialSafe(tag: string): Promise<void> {
  try {
    await syncServedCredential();
  } catch (err) {
    console.error(
      `[${tag}] credential sync failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}
