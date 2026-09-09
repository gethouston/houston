import type { LocalBridgeIdentity } from "@houston/protocol";
import type {
  LocalBridgeNativeEvent,
  LocalModelBridgePorts,
} from "@houston/sdk";
import { isBridgeUnsupported } from "@houston/sdk/local-model-bridge/unsupported";
import type { LocalModelBridgeAccess } from "@houston-ai/engine-client";
import { showErrorToast } from "./error-toast";
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
import { reportQuietError } from "./quiet-error-report";

/**
 * A gateway without the bridge capability is an expected deployment state,
 * not a broken connection: the guided dialog shows its own copy for it and the
 * boot-time resume stays silent to the user, so it reports only as the quiet
 * `bridge_unsupported` class instead of one bug per desktop boot.
 */
export function reportLocalBridgeError(error: unknown): void {
  if (isBridgeUnsupported(error)) {
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
  showErrorToast("local_model_bridge", "Local model connection failed", error);
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
