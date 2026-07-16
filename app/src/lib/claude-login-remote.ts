/**
 * Remote-engine half of the desktop Claude browser sign-in.
 *
 * On a CO-LOCATED engine the credential `claude auth login` just cached IS the
 * dir the local runtime reads, so nothing is pushed. On a REMOTE/HOSTED engine
 * the pod can't read this machine's Keychain, so after a successful browser
 * login the desktop EXTRACTS the cached credential (`read_claude_credential`)
 * and PUSHES it to the pod over the control plane, then polls until the pod's
 * runtime reads anthropic as connected.
 *
 * With NO agent selected (first-run onboarding, the cloud-migration wizard)
 * the push goes to the gateway's agentless SETUP runtime instead — same
 * central store, so the agents created or migrated right after are already
 * connected. Requiring a selected agent here was the bug that dumped every
 * pre-agent connect into the paste flow even though the browser login had
 * succeeded (HOU: "Finish signing in to Anthropic" during onboarding).
 *
 * The push RETRIES transient failures (engine 5xx, network) with backoff
 * before ever degrading — a waking pod or a momentary gateway blip must not
 * cost the user a manual token paste. And because the minted credential stays
 * cached on this machine, {@link pushCachedClaudeCredential} lets a later
 * session finish a failed handoff silently (see claude-login.ts's reconcile).
 *
 * SAFETY: this ships unsupervised, so EVERY user-initiated failure here
 * (extraction not-found, malformed cred, push non-200 after retries, network)
 * degrades to the existing setup-token paste flow with a friendly toast. A
 * bug in the push must never leave the user on a dead spinner.
 */

import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import {
  isTransientPushError,
  PUSH_RETRY_DELAYS_MS,
} from "./claude-push-retry";
import { getEngine } from "./engine";
import i18n from "./i18n";
import { logger } from "./logger";
import { osReadClaudeCredential } from "./os-bridge";
import { providerLoginFailureText } from "./provider-login-error";

/** Announce the outcome on the client bus (same shape as claude-login's own). */
type Announce = (
  provider: string,
  success: boolean,
  error: string | null,
) => void;

/** Poll until the engine reads the provider connected, or the window elapses. */
type Confirm = (provider: string) => Promise<boolean>;

/**
 * `getEngine()` is typed as the legacy engine-client, but the running instance
 * is the v3 host adapter, which adds this control-plane method. Feature-detected
 * exactly like `providerStatuses` in `tauri.ts`.
 */
type ClaudeCredentialPusher = {
  pushClaudeOAuthCredential?: (
    agentId: string | null,
    credentialJson: string,
  ) => Promise<void>;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ClaudeHandoffResult =
  | { ok: true }
  | { ok: false; reason: "no-credential" | "push-failed"; error: unknown };

/**
 * Read this machine's cached Claude credential and push it to the cloud —
 * the selected agent's pod, else the first loaded agent's (credentials are
 * workspace-central, any real pod stores and serves them), else the agentless
 * setup runtime (true first-run). Retries transient failures with backoff.
 * Never throws; the caller decides how loud the outcome is.
 */
export async function pushCachedClaudeCredential(): Promise<ClaudeHandoffResult> {
  let credentialJson: string;
  try {
    credentialJson = await osReadClaudeCredential();
  } catch (err) {
    return { ok: false, reason: "no-credential", error: err };
  }

  const agents = useAgentStore.getState();
  const agentId = agents.current?.id ?? agents.agents[0]?.id ?? null;

  const engine = getEngine() as unknown as ClaudeCredentialPusher;
  try {
    if (!engine.pushClaudeOAuthCredential) {
      throw new Error("This engine can't receive a pushed credential.");
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await engine.pushClaudeOAuthCredential(agentId, credentialJson);
        return { ok: true };
      } catch (err) {
        const delay = PUSH_RETRY_DELAYS_MS[attempt];
        if (delay === undefined || !isTransientPushError(err)) throw err;
        logger.warn(
          `[claude-login] credential push failed (attempt ${attempt + 1}); retrying in ${delay}ms`,
        );
        await sleep(delay);
      }
    }
  } catch (err) {
    return { ok: false, reason: "push-failed", error: err };
  }
}

/**
 * Extract this machine's freshly-cached Anthropic credential and push it to
 * the cloud, then confirm the connection. Any failure falls back to the paste
 * flow. Never rejects.
 */
export async function finishRemoteClaudeLogin(
  frontendProviderId: string,
  confirmConnected: Confirm,
  announce: Announce,
): Promise<void> {
  const result = await pushCachedClaudeCredential();
  if (!result.ok) {
    fallbackToPaste(frontendProviderId, result.error, announce);
    return;
  }

  // Stored + materialized on the pod. Poll until its runtime reads anthropic
  // connected, then flip the card. A confirm timeout is NOT a handoff failure
  // (the credential IS on the pod), so surface it like the co-located
  // confirmTimeout rather than dropping into the paste flow.
  const ok = await confirmConnected(frontendProviderId);
  announce(
    frontendProviderId,
    ok,
    ok ? null : i18n.t("providers:claudeLogin.confirmTimeout"),
  );
}

/**
 * Guaranteed safety net: degrade to the runtime's setup-token paste flow with a
 * friendly toast. Calls `providerLogin` DIRECTLY (not `launchLogin`, which would
 * re-enter the desktop browser login). If even starting the paste flow fails,
 * `announce(false)` clears the pending row so nothing spins forever.
 */
function fallbackToPaste(
  frontendProviderId: string,
  reason: unknown,
  announce: Announce,
): void {
  // The real reason (an extraction/push/network error, NEVER the token) goes to
  // the log tail for the bug report, not a raw toast dump.
  console.warn(
    "[claude-login] remote credential handoff failed; falling back to paste:",
    reason,
  );
  useUIStore.getState().addToast({
    title: i18n.t("providers:claudeLogin.autoFailedTitle"),
    description: i18n.t("providers:claudeLogin.autoFailedBody"),
    variant: "info",
  });
  getEngine()
    .providerLogin(frontendProviderId, { deviceAuth: true })
    .catch((err) => {
      announce(frontendProviderId, false, providerLoginFailureText(err));
    });
}
