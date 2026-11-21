import type { LocalModelBridgeAccess } from "@houston/engine-adapter";
import type { LocalBridgeIdentity } from "@houston/protocol";
import type {
  LocalBridgeNativeEvent,
  LocalModelBridgePorts,
} from "@houston/sdk";
import { showErrorToast } from "./error-toast";
import { planLocalBridgeReport } from "./local-bridge-report-plan";
import {
  legacyListen,
  osCompleteBridgeMigration,
  osForgetBridgeTarget,
  osLocalBridgeDevice,
  osLocalBridgeLegacyCandidate,
  osRenewLocalBridge,
  osSaveBridgeTarget,
  osSavedBridgeTarget,
  osStartLocalBridge,
  osStopLocalBridge,
} from "./os-bridge";
import { quietErrorDetails } from "./quiet-error-class";
import { reportQuietError } from "./quiet-error-report";

export function reportLocalBridgeError(error: unknown): void {
  const plan = planLocalBridgeReport(error);
  if (plan.kind === "cancelled") {
    console.debug(`[local_model_bridge] operation superseded: ${plan.cause}`);
    return;
  }
  if (plan.kind === "unsupported") {
    console.warn(
      "[local_model_bridge] this server offers no local model bridge",
    );
    reportQuietError(
      "bridge_unsupported",
      "local_model_bridge",
      "Local model bridge not offered by this server",
      error,
    );
    return;
  }
  if (plan.kind === "quiet") {
    console.warn(`[local_model_bridge] ${plan.quiet}: ${plan.cause}`);
    reportQuietError(
      plan.quiet,
      "local_model_bridge",
      "Local model connection failed",
      error,
      undefined,
      { cause: plan.cause },
    );
    return;
  }
  const { status, body } = quietErrorDetails(error);
  showErrorToast("local_model_bridge", "Local model connection failed", error, {
    extra: { cause: plan.cause, http_status: status, body },
  });
}

export function bridgeIdentityKey(identity: LocalBridgeIdentity): string {
  return JSON.stringify([
    identity.environment,
    identity.userId,
    identity.orgId,
    identity.agentId,
  ]);
}

export function desktopBridgePorts(
  management: LocalModelBridgeAccess,
): LocalModelBridgePorts {
  const identity = management.identity;
  const key = bridgeIdentityKey(identity);
  let listening: Promise<void> = Promise.resolve();
  let listenFailure: unknown;
  return {
    management,
    report: reportLocalBridgeError,
    storage: {
      load: osSavedBridgeTarget,
      save: osSaveBridgeTarget,
      clear: osForgetBridgeTarget,
    },
    native: {
      legacyCandidate: osLocalBridgeLegacyCandidate,
      completeMigration: osCompleteBridgeMigration,
      device: osLocalBridgeDevice,
      async start(args) {
        await listening;
        if (listenFailure) throw listenFailure;
        return osStartLocalBridge(args);
      },
      renew: (ticket) => osRenewLocalBridge(identity, ticket),
      stop: () => osStopLocalBridge(identity),
      subscribe(listener) {
        let disposed = false;
        let off: (() => void) | undefined;
        listening = legacyListen<
          LocalBridgeNativeEvent & { identity: LocalBridgeIdentity }
        >("local-bridge-status", ({ payload }) => {
          if (!disposed && bridgeIdentityKey(payload.identity) === key)
            listener(payload);
        })
          .then((unlisten) => {
            if (disposed) unlisten();
            else off = unlisten;
          })
          .catch((error: unknown) => {
            listenFailure = error;
            reportLocalBridgeError(error);
          });
        return () => {
          disposed = true;
          off?.();
        };
      },
    },
  };
}
