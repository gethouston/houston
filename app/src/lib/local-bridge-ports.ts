import type { LocalModelBridgeAccess } from "@houston/engine-adapter";
import type { LocalBridgeIdentity } from "@houston/protocol";
import type {
  LocalBridgeNativeEvent,
  LocalModelBridgePorts,
} from "@houston/sdk";
import { isBridgeUnsupported } from "@houston/sdk/local-model-bridge/unsupported";
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
import { quietErrorDetails } from "./quiet-error-class";
import { reportQuietError } from "./quiet-error-report";

/**
 * A gateway without the bridge capability is an expected deployment state,
 * not a broken connection: the guided dialog shows its own copy for it and the
 * boot-time resume stays silent to the user, so it reports only as the quiet
 * `bridge_unsupported` class instead of one bug per desktop boot. The other
 * bridge quiet classes (`bridge_no_agent`, `bridge_state`) are the toast
 * layer's gate. Whatever stays loud keeps its cause: the report error carries
 * only the stack, so the status, gateway body and message ride as `extra`
 * (every event used to arrive with `extra: null`, PRODUCT-1833).
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
  const { status, body } = quietErrorDetails(error);
  showErrorToast("local_model_bridge", "Local model connection failed", error, {
    extra: {
      cause:
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error),
      http_status: status,
      body,
    },
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
