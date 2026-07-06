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
 * SAFETY: this ships unsupervised, so EVERY failure here (extraction not-found,
 * malformed cred, no agent selected, push non-200, network) degrades to the
 * existing setup-token paste flow with a friendly toast. A bug in the push must
 * never leave the user on a dead spinner.
 */

import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { getEngine } from "./engine";
import i18n from "./i18n";
import { osReadClaudeCredential } from "./os-bridge";

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
    agentId: string,
    credentialJson: string,
  ) => Promise<void>;
};

/**
 * Extract this machine's freshly-cached Anthropic credential and push it to the
 * selected agent's pod, then confirm the connection. Any failure falls back to
 * the paste flow. Never rejects.
 */
export async function finishRemoteClaudeLogin(
  frontendProviderId: string,
  confirmConnected: Confirm,
  announce: Announce,
): Promise<void> {
  let credentialJson: string;
  try {
    credentialJson = await osReadClaudeCredential();
  } catch (err) {
    fallbackToPaste(frontendProviderId, err, announce);
    return;
  }

  const agentId = useAgentStore.getState().current?.id ?? null;
  if (!agentId) {
    fallbackToPaste(
      frontendProviderId,
      new Error("No agent is selected."),
      announce,
    );
    return;
  }

  const engine = getEngine() as unknown as ClaudeCredentialPusher;
  try {
    if (!engine.pushClaudeOAuthCredential) {
      throw new Error("This engine can't receive a pushed credential.");
    }
    await engine.pushClaudeOAuthCredential(agentId, credentialJson);
  } catch (err) {
    fallbackToPaste(frontendProviderId, err, announce);
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
      announce(
        frontendProviderId,
        false,
        err instanceof Error ? err.message : String(err),
      );
    });
}
