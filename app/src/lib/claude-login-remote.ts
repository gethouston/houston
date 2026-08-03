/**
 * Remote-engine half of the desktop Claude browser sign-in.
 *
 * On a CO-LOCATED engine the credential `claude auth login` just cached IS the
 * dir the local runtime reads, so nothing is pushed. On a REMOTE/HOSTED engine
 * the pod can't read this machine's Keychain, so the login mints into a
 * throwaway HANDOFF dir; after `Login successful` the desktop EXTRACTS that
 * credential (`read_claude_credential`), PUSHES it to the pod over the control
 * plane, DESTROYS the local copy, then polls until the pod's runtime reads
 * anthropic as connected.
 *
 * OWNERSHIP: Anthropic refresh tokens rotate — one family tolerates exactly
 * one rotator, and a second one trips reuse-detection and revokes the family
 * everywhere (HOU-950). So the freshly minted family is handed off
 * EXCLUSIVELY: once pushed, the gateway is its only holder, which is why the
 * handoff-dir copy is discarded the moment the push settles (success or
 * terminal failure). There is deliberately no path that re-pushes a cached
 * snapshot later — a failed handoff means the user reconnects from the card,
 * minting a new family.
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
 * cost the user a manual token paste.
 *
 * SAFETY: this ships unsupervised, so EVERY user-initiated failure here
 * (extraction not-found, malformed cred, push non-200 after retries, network)
 * degrades to the existing setup-token paste flow with a friendly toast. A
 * bug in the push must never leave the user on a dead spinner. But a push
 * TRANSPORT failure alone is not proof the credential didn't land (HOU-1143):
 * before degrading, the settlement policy (`claude-login-settle`) asks the
 * engine's own usability probe — connected means connected, dialog withheld.
 */

import { useUIStore } from "../stores/ui";
import { pushClaudeCredentialWithRetry } from "./claude-credential-push";
import {
  type ClaudeHandoffResult,
  settleRemoteClaudeLogin,
} from "./claude-login-settle";
import { getEngine } from "./engine";
import { reportError } from "./error-report";
import i18n from "./i18n";
import { logger } from "./logger";
import {
  osDiscardClaudeHandoffCredential,
  osReadClaudeCredential,
} from "./os-bridge";
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
 * Read the handoff dir's freshly minted Claude credential and push it to the
 * cloud — the selected agent's pod, else the first loaded agent's (credentials
 * are workspace-central, any real pod stores and serves them), else the
 * agentless setup runtime (true first-run). Retries transient failures with
 * backoff. Never throws; the caller decides how loud the outcome is.
 *
 * A fresh mint always REPLACES whatever the central store holds — the user
 * just authorized this space, and the old row's family (if any) simply stops
 * being rotated once overwritten, which Anthropic treats as abandonment, not
 * reuse.
 */
async function pushMintedClaudeCredential(): Promise<ClaudeHandoffResult> {
  let credentialJson: string;
  try {
    credentialJson = await osReadClaudeCredential(true);
  } catch (err) {
    return { ok: false, reason: "no-credential", error: err };
  }

  // The target pod is resolved by the engine adapter's ONE space-validated
  // accessor (HOU-979). Picking it here off the agent STORE was a third,
  // unsynchronized source of the routing id: right after a space switch the
  // store can still hold the previous space's agents, so a freshly minted
  // credential would be pushed at an agent the active space does not have.
  //
  // `pushClaudeOAuthCredential` is declared on `HoustonClient` itself (the legacy
  // client rejects loudly, the v3 adapter implements it), so this needs no cast.
  const result = await pushClaudeCredentialWithRetry({
    push: (json) => getEngine().pushClaudeOAuthCredential(json),
    credentialJson,
    onRetry: (attempt, delay) =>
      logger.warn(
        `[claude-login] credential push failed (attempt ${attempt}); retrying in ${delay}ms`,
      ),
  });
  return result.ok
    ? { ok: true }
    : { ok: false, reason: "push-failed", error: result.error };
}

/**
 * Destroy the handoff dir's local copy once the push has settled. On success
 * the gateway is the family's sole rotator and the copy is a revocation
 * hazard; on failure the mint is abandoned (never re-pushed), so the copy is
 * dead weight either way. A deletion failure is only logged: the leftover is
 * inert (nothing reads or rotates the handoff dir outside a login) and the
 * next login overwrites it — not worth interrupting a flow that succeeded.
 */
async function discardHandoffCopy(): Promise<void> {
  try {
    await osDiscardClaudeHandoffCredential();
  } catch (err) {
    logger.warn(
      `[claude-login] could not discard the handed-off credential copy: ${String(err)}`,
    );
  }
}

/**
 * Extract the freshly minted Anthropic credential from the handoff dir, push
 * it to the cloud, and destroy the local copy, then settle the outcome from
 * the engine's own view (`claude-login-settle`): a push whose TRANSPORT
 * failed but whose credential landed anyway announces success (HOU-1143 —
 * the spurious paste dialog over a working connect), and only a genuinely
 * disconnected anthropic falls back to the paste flow. Never rejects.
 */
export async function finishRemoteClaudeLogin(
  frontendProviderId: string,
  confirmConnected: Confirm,
  announce: Announce,
): Promise<void> {
  const result = await pushMintedClaudeCredential();
  await discardHandoffCopy();
  const settlement = await settleRemoteClaudeLogin(result, () =>
    confirmConnected(frontendProviderId),
  );
  switch (settlement.kind) {
    case "connected":
      if (settlement.recovered) {
        // The connect WORKED, so no user-facing failure — but the transport
        // error that almost cost this user a manual token paste must reach
        // Sentry, or the whole class stays invisible (HOU-1143 was reported
        // by a user; nothing had been captured).
        reportError(
          "push_claude_oauth_credential",
          "Claude credential push failed in transit, but the engine reads anthropic connected — recovered without the paste flow",
          !result.ok ? result.error : undefined,
        );
      }
      announce(frontendProviderId, true, null);
      return;
    case "confirm-timeout":
      // NOT a handoff failure (the credential IS stored) — surface it like
      // the co-located confirmTimeout rather than dropping into paste.
      announce(
        frontendProviderId,
        false,
        i18n.t("providers:claudeLogin.confirmTimeout"),
      );
      return;
    case "paste":
      fallbackToPaste(frontendProviderId, settlement.reason, announce);
      return;
  }
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
  // the log tail AND to Sentry — the degrade used to be console-only, so every
  // paste fallback in the wild was invisible until a user filed it (HOU-1143).
  console.warn(
    "[claude-login] remote credential handoff failed; falling back to paste:",
    reason,
  );
  reportError(
    "push_claude_oauth_credential",
    "Claude credential handoff failed and anthropic reads disconnected — degrading to the setup-token paste flow",
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
