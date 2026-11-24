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

/**
 * The one funnel every bridge rejection reaches; the decision is
 * `planLocalBridgeReport`. A superseded operation (the lifetime invalidated by
 * a space or agent switch, a disposed controller) is logged and nothing more:
 * nothing broke (HOUSTON-APP-5HX). A gateway without the bridge capability is
 * an expected deployment state, not a broken connection: the guided dialog
 * shows its own copy for it and the boot-time resume stays silent to the user,
 * so it reports only as the quiet `bridge_unsupported` class instead of one
 * bug per desktop boot. The other bridge quiet classes (`bridge_no_agent`,
 * `bridge_state`) report the same way, with the cause as `extra`. Whatever
 * stays loud keeps its
 * cause: the report error carries only the stack, so the status, gateway body
 * and message ride as `extra` (every event used to arrive with `extra: null`,
 * PRODUCT-1833).
 */
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
