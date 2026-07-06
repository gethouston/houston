import { join } from "node:path";
import { PROVIDERS } from "../ai/providers";
import { config } from "../config";
import {
  applyServedCredential,
  readServedProvidersAt,
  removeServedCredentialAt,
  type ServedCredential,
  scrubRefreshTokensAt,
  writeServedProvidersAt,
} from "./auth-file";
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
 * full credential (access + refresh) locally. The control plane captures it
 * into the central store immediately afterwards and then calls
 * POST /auth/scrub-refresh, which rewrites every entry with refresh="".
 *
 * Best-effort on sync: a transient control-plane blip leaves the existing
 * (still-valid) auth.json in place; a missing connection surfaces downstream as
 * the runtime's normal "No provider connected" error.
 */

const authPathFor = () => join(config.dataDir, "auth.json");
const servedManifestPathFor = () =>
  join(config.dataDir, "served-providers.json");

/**
 * Marker the host sets on its /sandbox/credential 404: the credential store's
 * own "not connected" answer. Only marked 404s are an authoritative logout —
 * a bare 404 (an old host, a mistyped control-plane URL, a route-level miss)
 * must never delete a working credential.
 */
const NOT_CONNECTED_HEADER = "x-houston-not-connected";

/** One stalled host/gateway socket must not hang every hydrating route. */
const SERVE_FETCH_TIMEOUT_MS = 10_000;

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
 */
let serveSyncInFlight: Promise<string[]> | null = null;

export function syncServedCredential(): Promise<string[]> {
  if (serveSyncInFlight) return serveSyncInFlight;
  serveSyncInFlight = runServedSync().finally(() => {
    serveSyncInFlight = null;
  });
  return serveSyncInFlight;
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

type ServeProbe =
  | { id: string; state: "served"; cred: ServedCredential }
  | { id: string; state: "not-connected" }
  | { id: string; state: "error"; detail: string };

/** One provider's central lookup. Never throws — an internal serve hiccup for
 *  ONE provider must not strand the others. */
async function probeProvider(id: string): Promise<ServeProbe> {
  try {
    const res = await fetch(
      `${config.controlPlaneUrl}/sandbox/credential?provider=${id}`,
      {
        headers: { Authorization: `Bearer ${config.sandboxToken}` },
        signal: AbortSignal.timeout(SERVE_FETCH_TIMEOUT_MS),
      },
    );
    if (res.status === 404 && res.headers.get(NOT_CONNECTED_HEADER) === "1")
      return { id, state: "not-connected" };
    if (!res.ok)
      return {
        id,
        state: "error",
        detail: `${res.status}: ${await res.text().catch(() => "")}`,
      };
    return {
      id,
      state: "served",
      cred: (await res.json()) as ServedCredential,
    };
  } catch (err) {
    return {
      id,
      state: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Anthropic is deliberately NOT served through this per-turn auth.json path. A
 * hosted pod materializes the Claude subscription credential as the SDK's own
 * `<CLAUDE_CONFIG_DIR>/.credentials.json` (see backends/claude/credentials-file),
 * and the SDK self-refreshes from the refresh token THERE — pulling an
 * access-only central token per turn (Gate #2 shape) would fight that file and
 * strip the refresh token the pod needs. Every OTHER provider serves here.
 */
const SERVE_EXCLUDED = new Set<string>(["anthropic"]);

async function runServedSync(): Promise<string[]> {
  if (!serveModeOn()) return [];
  // Probes are independent — run them in parallel so a hydrating route pays one
  // round-trip, not eleven. The auth.json writes below stay serial.
  const probes = await Promise.all(
    PROVIDERS.filter((p) => !SERVE_EXCLUDED.has(p.id)).map((p) =>
      probeProvider(p.id),
    ),
  );
  const applied: string[] = [];
  const removed: string[] = [];
  // Provenance gate: an authoritative "not connected" may only remove providers
  // this runtime learned from serve mode. A locally-connected credential the
  // central store never held (the Anthropic setup token, an openai-compatible
  // local model) is shaped like a served one, so shape alone cannot decide.
  const manifest = new Set(readServedProvidersAt(servedManifestPathFor()));
  let manifestDirty = false;
  for (const probe of probes) {
    if (probe.state === "served") {
      applyServedCredential(authPathFor(), probe.cred);
      applied.push(probe.id);
      if (!manifest.has(probe.id)) {
        manifest.add(probe.id);
        manifestDirty = true;
      }
    } else if (probe.state === "not-connected" && manifest.has(probe.id)) {
      // A refresh-bearing OAuth entry still survives inside
      // removeServedCredentialAt: that's the device-code connect mid-capture.
      if (removeServedCredentialAt(authPathFor(), probe.id))
        removed.push(probe.id);
      manifest.delete(probe.id);
      manifestDirty = true;
    } else if (probe.state === "error") {
      console.error(`[serve] credential ${probe.id}: ${probe.detail}`);
    }
  }
  if (manifestDirty)
    writeServedProvidersAt(servedManifestPathFor(), [...manifest]);
  // pi's AuthStorage caches auth.json in memory at startup; a direct write is
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
