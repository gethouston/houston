import type { Capabilities } from "@houston/protocol";
import { LOCAL_CAPABILITIES } from "../capabilities";
import { managedBridgeCapability } from "./bridge-capability";
import type { createHostHeartbeat } from "./host-heartbeat";
import type { createHostIntegrations } from "./host-integrations";
import type { LocalHostOptions } from "./host-options";

/** What this host actually serves, advertised on `/v1/capabilities`. */
export function servedCapabilities(
  opts: LocalHostOptions,
  { registry, customIntegrations }: ReturnType<typeof createHostIntegrations>,
  { heartbeatRunner }: ReturnType<typeof createHostHeartbeat>,
): Capabilities {
  return {
    ...(opts.capabilities ?? LOCAL_CAPABILITIES),
    officePreview: !!opts.officeConvert,
    ...managedBridgeCapability(opts.gatewayFronted, opts.credentials),
    // Served capabilities advertise the integrations actually wired, not the
    // profile's nominal list — an unconfigured deployment says [] honestly.
    integrations: registry.ids(),
    // On exactly when this host serves a browser-reachable OAuth callback.
    customIntegrationOAuth: customIntegrations.oauthSupported,
    ...(heartbeatRunner ? { heartbeat: true } : {}),
    // `triggers` is never advertised here: this host has no trigger backend. On
    // managed cloud the Go edge advertises the capability; a pod/self-host/desktop
    // stays byte-identical to the nominal profile (absent = off, protocol #core).
  };
}
