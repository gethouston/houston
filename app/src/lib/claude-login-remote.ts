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

type Announce = (
  provider: string,
  success: boolean,
  error: string | null,
) => void;

type Confirm = (provider: string) => Promise<boolean>;

async function pushMintedClaudeCredential(): Promise<ClaudeHandoffResult> {
  let credentialJson: string;
  try {
    credentialJson = await osReadClaudeCredential(true);
  } catch (err) {
    return { ok: false, reason: "no-credential", error: err };
  }

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

async function discardHandoffCopy(): Promise<void> {
  try {
    await osDiscardClaudeHandoffCredential();
  } catch (err) {
    logger.warn(
      `[claude-login] could not discard the handed-off credential copy: ${String(err)}`,
    );
  }
}

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
        reportError(
          "push_claude_oauth_credential",
          "Claude credential push failed in transit, but the engine reads anthropic connected — recovered without the paste flow",
          !result.ok ? result.error : undefined,
        );
      }
      announce(frontendProviderId, true, null);
      return;
    case "confirm-timeout":
      announce(
        frontendProviderId,
        false,
        i18n.t("providers:claudeLogin.confirmTimeout"),
      );
      return;
    case "handoff-failed":
      reportError(
        "push_claude_oauth_credential",
        "Claude credential handoff failed and anthropic reads disconnected — surfacing the failure as an error",
        settlement.reason,
      );
      announce(
        frontendProviderId,
        false,
        i18n.t("providers:claudeLogin.handoffFailed"),
      );
      return;
  }
}

export function fallbackToPaste(
  frontendProviderId: string,
  reason: unknown,
  announce: Announce,
): void {
  console.warn(
    "[claude-login] browser login unavailable on this machine; falling back to paste:",
    reason,
  );
  reportError(
    "push_claude_oauth_credential",
    "Claude browser-login helper cannot run on this machine — degrading to the token paste flow",
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
