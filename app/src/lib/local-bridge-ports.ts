import type { LocalBridgeIdentity } from "@houston/protocol";
import {
  isBridgeUnsupported,
  type LocalBridgeNativeEvent,
  type LocalModelBridgePorts,
} from "@houston/sdk";
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

/**
 * Report-only (no toast): a bridge failure is background state. A deployment
 * that serves no local model connections at all is not a failure — the
 * bridge is simply off there — so it is never reported. The cause rides in
 * the message: without it every report read as the same bare label.
 */
export function reportLocalBridgeError(error: unknown): void {
  if (isBridgeUnsupported(error)) return;
  const cause =
    error instanceof Error && error.message ? `: ${error.message}` : "";
  showErrorToast(
    "local_model_bridge",
    `Local model connection failed${cause}`,
    error,
  );
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
