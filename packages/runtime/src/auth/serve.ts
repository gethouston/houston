import { piApiKeyProviderIds } from "../ai/pi-catalog";
import { PROVIDERS } from "../ai/providers";
import { clearGhostClaudeCredential } from "../backends/claude/credential-status";
import { config } from "../config";
import { currentCredentialScope } from "../session/acting-context";
import {
  applyServedCredential,
  authPathIn,
  readServedProvidersAt,
  removeServedCredentialAt,
  scrubRefreshTokensAt,
  servedProvidersPathIn,
  writeServedProvidersAt,
} from "./auth-file";
import { bindEmptyRefreshServeSync } from "./empty-refresh-guard";
import { logServeProbeFailure, noteServeProbeOk } from "./serve-log";
import { probeProviders } from "./serve-probe";
import { reportDeadServedApiKey, servedApiKeyIsDead } from "./served-key-guard";
import { forgetServedScope, recordServedScope } from "./served-scope";
import { authStorage } from "./storage";

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
 * afterwards and then calls POST /auth/scrub-refresh, which rewrites every entry
 * with refresh=""; normal serving resumes after that scrub.
 *
 * Best-effort on sync: a transient control-plane blip leaves the existing
 * (still-valid) auth.json in place; a missing connection surfaces downstream as
 * the runtime's normal "No provider connected" error.
 */

/**
 * Both paths resolve through the CURRENT acting identity (HOU-976): a member's
 * sync writes that member's file only. With no acting identity these are
 * `<dataDir>/auth.json` and `<dataDir>/served-providers.json` — unchanged.
 */
const authPathFor = () =>
  authPathIn(config.dataDir, currentCredentialScope().key);
const servedManifestPathFor = () =>
  servedProvidersPathIn(config.dataDir, currentCredentialScope().key);

/** True when the sandbox is wired to serve a central workspace credential. */
export function serveModeOn(): boolean {
  return !!config.controlPlaneUrl && !!config.sandboxToken;
}

/** Config-bound scrub used by POST /auth/scrub-refresh. */
export function scrubRefreshTokens(): string[] {
  const scrubbed = scrubRefreshTokensAt(authPathFor());
  if (scrubbed.length) authStorage.reload();
  return scrubbed;
}

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

// PRODUCT-1317: the credential store's empty-refresh guard re-serves an
// expiring access-only entry through THIS single-flighted sync before pi's
// expiry check can route it into a refresh. Bound rather than imported by the
// store — a direct import would cycle (serve → storage → credential-store →
// serve). The safe variant on purpose: a hydration failure must never fail
// the credential read it precedes (the modify mask still guards), and the
// safe wrapper already logs the failure.
bindEmptyRefreshServeSync(() =>
  syncServedCredentialSafe("empty-refresh-guard"),
);

async function runServedSync(): Promise<string[]> {
  if (!serveModeOn()) return [];
  // Anthropic serves through this same per-turn access-only path (Gate #2) —
  // the served token rides `CLAUDE_CODE_OAUTH_TOKEN` into the Claude Agent SDK
  // subprocess (backends/claude/read-token), where the env var outranks any
  // stale materialized `.credentials.json`, so a recycled pod reconnects from
  // the central store instead of losing the credential with its emptyDir.
  // WHETHER anthropic serves is the CONTROL PLANE's call, not ours: a managed
  // pod's host serves it (the gateway is the single refresher), while the
  // desktop/self-host host answers a marked 404 so the local keychain flow
  // stays the one credential holder (routes/credential.ts).
  // EVERY provider a central credential can exist for: the curated catalog PLUS
  // the uncurated pi api-key providers. Connect deliberately accepts a pasted
  // key for any pi api-key provider (the host's isApiKeyProvider gate) and the
  // gateway durably stores it — but a recycled pod rebuilds auth.json ONLY from
  // this sync, so a provider missing here reads disconnected after every pod
  // roll even though the org never logged out (PRODUCT-1213: cerebras).
  const curated = new Set<string>(PROVIDERS.map((p) => p.id));
  const probeIds = [
    ...curated,
    ...piApiKeyProviderIds().filter((id) => !curated.has(id)),
  ];
  // Probes are independent — run them concurrently (a small pool, one retry
  // each; serve-probe.ts) so a hydrating route pays a few round-trips, not
  // forty sockets at once. The auth.json writes below stay serial.
  const probes = await probeProviders(probeIds);
  const applied: string[] = [];
  const removed: string[] = [];
  // Provenance gate: an authoritative "not connected" may only remove providers
  // this runtime learned from serve mode. A locally-connected credential the
  // central store never held (the Anthropic setup token, an openai-compatible
  // local model) is shaped like a served one, so shape alone cannot decide.
  const manifest = new Set(readServedProvidersAt(servedManifestPathFor()));
  let manifestDirty = false;
  for (const probe of probes) {
    if (probe.state !== "error") noteServeProbeOk(probe.id);
    if (probe.state === "served" && servedApiKeyIsDead(probe.cred)) {
      // A served "API key" that can never authenticate (a legacy OAuth token
      // stored as a google key — HOU-1107) must not reach auth.json: applying
      // it burns every turn on a doomed 401 and the next sync re-applies it.
      // Refuse it, drop any previously-applied copy (provenance-gated like the
      // not-connected path below), and report the dead central row so the
      // store stops serving it to the whole workspace (HOU-952 pipeline).
      reportDeadServedApiKey(probe.cred);
      forgetServedScope(probe.id);
      if (manifest.has(probe.id)) {
        if (removeServedCredentialAt(authPathFor(), probe.id))
          removed.push(probe.id);
        manifest.delete(probe.id);
        manifestDirty = true;
      }
      continue;
    }
    if (probe.state === "served") {
      const didApply = applyServedCredential(authPathFor(), probe.cred);
      // WHOSE credential this was, remembered for the provider-error stamp and
      // the /providers row. Recorded on the gateway's ANSWER, not on the write:
      // a skipped apply is the mid-capture guard over this same scope's own
      // fresh login, never another member's credential. A pre-HOU-976 gateway
      // omits `scope`; the only thing it could have served is the team one.
      recordServedScope(
        probe.id,
        probe.cred.scope === "personal" ? "personal" : "team",
      );
      if (didApply) applied.push(probe.id);
      if (didApply && !manifest.has(probe.id)) {
        manifest.add(probe.id);
        manifestDirty = true;
      }
    } else if (probe.state === "not-connected") {
      // Nothing is served for this scope any more, so no stale verdict may be
      // stamped on a later error.
      forgetServedScope(probe.id);
      // Anthropic keeps a SECOND copy of its credential: the materialized
      // `.credentials.json` the Claude Agent SDK falls back to once the served
      // env token is gone. Left behind, that ghost re-runs every turn on the
      // dead family — the exact storm the HOU-952 heal was meant to end
      // (PRODUCT-1307). Cleared OUTSIDE the manifest gate (PRODUCT-1323): a
      // ghost planted while anthropic was never in the served manifest (a
      // setup pod's non-attributed connect whose row was later removed, a
      // verify-rejected self-host row) would otherwise never be cleared — and
      // the provenance gate then blocks the revocation reporter too. The
      // function is serve-mode-reached-only, personal-scope-guarded, and a
      // no-op without the file, so an ordinary disconnected pod pays nothing.
      // EXCEPT on a deployment that never serves anthropic (`notServedHere`,
      // the desktop/self-host refusal): there the file IS the browser login's
      // legitimate credential and this answer says nothing about the central
      // store — deleting it would disconnect a healthy local Claude.
      if (probe.id === "anthropic" && !probe.notServedHere)
        clearGhostClaudeCredential();
      if (manifest.has(probe.id)) {
        // A refresh-bearing OAuth entry still survives inside
        // removeServedCredentialAt: that's the device-code connect mid-capture.
        if (removeServedCredentialAt(authPathFor(), probe.id))
          removed.push(probe.id);
        manifest.delete(probe.id);
        manifestDirty = true;
      }
    } else {
      // Dedup lives in serve-log.ts: every turn and hydrating route re-probes,
      // so a persistent gateway failure must not emit one Sentry error each.
      logServeProbeFailure(probe.id, probe.detail);
    }
  }
  if (manifestDirty)
    writeServedProvidersAt(servedManifestPathFor(), [...manifest]);
  // Houston's auth store caches auth.json in memory at startup; a direct write is
  // invisible to hasAuth()/resolveModel() until we re-read it. This is the line
  // that makes a never-connected agent actually see the served credential.
  if (applied.length || removed.length) authStorage.reload();
  // One-line per-turn diagnostic: which central credentials this serve applied.
  // If a connected provider is absent here (its serve 404'd), its token can't be
  // refreshed centrally — the silent-404 path that left Copilot un-served.
  console.log(
    `[serve] applied central credentials: ${applied.join(", ") || "(none)"}`,
  );
  return applied;
}
