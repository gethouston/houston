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
  const curated = new Set<string>(PROVIDERS.map((p) => p.id));
  const probeIds = [
    ...curated,
    ...piApiKeyProviderIds().filter((id) => !curated.has(id)),
  ];
  const probes = await probeProviders(probeIds);
  const sweepDetail = uniformFailureDetail(probes);
  if (sweepDetail !== undefined)
    logServeSweepFailure(probes.length, sweepDetail);
  else {
    noteServeSweepOk();
    logServeProbeFailures(
      probes.flatMap((p) => (p.state === "error" ? [p] : [])),
    );
  }
  const applied: string[] = [];
  const removed: Removal[] = [];
  const manifest = new Set(readServedProvidersAt(servedManifestPathFor()));
  let manifestDirty = false;
  for (const probe of probes) {
    if (probe.state !== "error") noteServeProbeOk(probe.id);
    const servedVerdict = anthropicServedVerdict(probe);
    if (servedVerdict !== undefined) setAnthropicServedHere(servedVerdict);
    if (probe.state === "served" && servedApiKeyIsDead(probe.cred)) {
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
      if (scrubSettledCaptureAt(authPathFor(), probe.cred)) {
        console.error(
          `[serve] PRODUCT-1318: scrubbed a leftover ${probe.id} refresh token — its capture landed centrally but the capture-time scrub never did`,
        );
      }
      const didApply = applyServedCredential(authPathFor(), probe.cred);
      applyServedAzureEndpoint(probe.id, probe.cred.enterpriseUrl);
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
      forgetServedScope(probe.id);
      let dropped = false;
      if (probe.id === "anthropic" && !probe.notServedHere)
        dropped = clearGhostClaudeCredential();
      if (manifest.has(probe.id)) {
        if (removeServedCredentialAt(authPathFor(), probe.id)) dropped = true;
        manifest.delete(probe.id);
        manifestDirty = true;
      }
      if (dropped) removed.push({ id: probe.id, reason: NOT_CONNECTED });
    }
  }
  if (manifestDirty)
    writeServedProvidersAt(servedManifestPathFor(), [...manifest]);
  if (applied.length || removed.length) authStorage.reload();
  console.log(
    `[serve] applied central credentials: ${applied.join(", ") || "(none)"}`,
  );
  logRemovals(removed);
  return applied;
}
