import { applyServedAzureEndpoint } from "../ai/azure-openai";
import { piApiKeyProviderIds } from "../ai/pi-catalog";
import { PROVIDERS } from "../ai/providers";
import { clearGhostClaudeCredential } from "../backends/claude/credential-status";
import {
  applyServedCredential,
  readServedProvidersAt,
  removeServedCredentialAt,
  writeServedProvidersAt,
} from "./auth-file";
import { scrubSettledCaptureAt } from "./capture-settlement";
import {
  authPathFor,
  servedManifestPathFor,
  serveModeOn,
  setAnthropicServedHere,
} from "./serve-context";
import {
  logServeProbeFailures,
  logServeSweepFailure,
  noteServeProbeOk,
  noteServeSweepOk,
} from "./serve-log";
import { anthropicServedVerdict, probeProviders } from "./serve-probe";
import {
  DEAD_KEY,
  logRemovals,
  NOT_CONNECTED,
  type Removal,
  uniformFailureDetail,
} from "./serve-sync-diagnostics";
import { reportDeadServedApiKey, servedApiKeyIsDead } from "./served-key-guard";
import { forgetServedScope, recordServedScope } from "./served-scope";
import { authStorage } from "./storage";

export async function runServedSync(): Promise<string[]> {
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
  // Every probe failing with ONE detail is the control plane being unreachable
  // (the host closing under this runtime, a gateway outage) — one incident,
  // logged once (serve-log.ts), never once per provider (PRODUCT-1399). The
  // loop below still treats each as an error verdict: nothing applied or
  // removed, auth.json kept as is, the next sync re-probes.
  const sweepDetail = uniformFailureDetail(probes);
  if (sweepDetail !== undefined)
    logServeSweepFailure(probes.length, sweepDetail);
  else {
    noteServeSweepOk();
    // A PARTIALLY failed sweep collapses the same way: probes sharing one
    // failure detail are one incident (a control-plane blip caught mid-sweep —
    // PRODUCT-1423), and dedup across syncs lives in serve-log.ts, so a
    // persistent failure never emits one Sentry error per re-probe.
    logServeProbeFailures(
      probes.flatMap((p) => (p.state === "error" ? [p] : [])),
    );
  }
  const applied: string[] = [];
  const removed: Removal[] = [];
  // Provenance gate: an authoritative "not connected" may only remove providers
  // this runtime learned from serve mode. A locally-connected credential the
  // central store never held (the Anthropic setup token, an openai-compatible
  // local model) is shaped like a served one, so shape alone cannot decide.
  const manifest = new Set(readServedProvidersAt(servedManifestPathFor()));
  let manifestDirty = false;
  for (const probe of probes) {
    if (probe.state !== "error") noteServeProbeOk(probe.id);
    const servedVerdict = anthropicServedVerdict(probe);
    if (servedVerdict !== undefined) setAnthropicServedHere(servedVerdict);
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
          removed.push({ id: probe.id, reason: DEAD_KEY });
        manifest.delete(probe.id);
        manifestDirty = true;
      }
      continue;
    }
    if (probe.state === "served") {
      // PRODUCT-1318 self-heal: a refresh-bearing local entry whose ACCESS the
      // central store is serving back means the capture PUT landed but its
      // scrub was lost — finish the scrub now (a different access is a real
      // mid-capture login and is left alone; see capture-settlement.ts).
      // Without this, the leftover refresh token kept the pod rotating the
      // family alongside the gateway forever.
      if (scrubSettledCaptureAt(authPathFor(), probe.cred)) {
        console.error(
          `[serve] PRODUCT-1318: scrubbed a leftover ${probe.id} refresh token — its capture landed centrally but the capture-time scrub never did`,
        );
      }
      const didApply = applyServedCredential(authPathFor(), probe.cred);
      // Azure's per-resource endpoint rides the served row (its
      // `enterpriseUrl` slot). Landed OUTSIDE the didApply gate: the apply
      // guard protects a mid-capture refresh token, which an api_key row
      // never carries, and the endpoint write is idempotent (PRODUCT-1532).
      applyServedAzureEndpoint(probe.id, probe.cred.enterpriseUrl);
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
      let dropped = false;
      if (probe.id === "anthropic" && !probe.notServedHere)
        dropped = clearGhostClaudeCredential();
      if (manifest.has(probe.id)) {
        // A refresh-bearing OAuth entry still survives inside
        // removeServedCredentialAt: that's the device-code connect mid-capture.
        if (removeServedCredentialAt(authPathFor(), probe.id)) dropped = true;
        manifest.delete(probe.id);
        manifestDirty = true;
      }
      if (dropped) removed.push({ id: probe.id, reason: NOT_CONNECTED });
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
  logRemovals(removed);
  return applied;
}
