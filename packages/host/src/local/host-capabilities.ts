import type { Capabilities } from "@houston/protocol";
import { LOCAL_CAPABILITIES } from "../capabilities";
import { managedBridgeCapability } from "./bridge-capability";
import type { createHostHeartbeat } from "./host-heartbeat";
import type { createHostIntegrations } from "./host-integrations";
import type { LocalHostOptions } from "./host-options";

export function servedCapabilities(
  opts: LocalHostOptions,
  { registry, customIntegrations }: ReturnType<typeof createHostIntegrations>,
  { heartbeatRunner }: ReturnType<typeof createHostHeartbeat>,
): Capabilities {
  return {
    ...(opts.capabilities ?? LOCAL_CAPABILITIES),
    officePreview: !!opts.officeConvert,
    ...managedBridgeCapability(opts.gatewayFronted, opts.credentials),
    integrations: registry.ids(),
    customIntegrationOAuth: customIntegrations.oauthSupported,
    ...(heartbeatRunner ? { heartbeat: true } : {}),
  };
}
