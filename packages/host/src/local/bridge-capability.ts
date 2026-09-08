import type { Capabilities } from "@houston/protocol";

interface ManagedCallback {
  url: string;
  orgSlug: string;
  agentSlug: string;
  podToken: string;
}
export function managedBridgeCapability(
  gatewayFronted: boolean | undefined,
  callback: ManagedCallback | undefined,
): Pick<Capabilities, "localModelBridge"> {
  if (!gatewayFronted || !callback || !Object.values(callback).every(Boolean))
    return {};
  const url = new URL(callback.url);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return {};
  return { localModelBridge: { versions: [1] } };
}
export function managedBridgeRuntimeEnv(
  gatewayFronted: boolean | undefined,
  callback: ManagedCallback | undefined,
): Record<string, string> {
  if (
    !callback ||
    !managedBridgeCapability(gatewayFronted, callback).localModelBridge
  )
    return {};
  return {
    HOUSTON_CREDENTIALS_URL: callback.url,
    HOUSTON_ORG_SLUG: callback.orgSlug,
    HOUSTON_AGENT_SLUG: callback.agentSlug,
    HOUSTON_HOST_TOKEN: callback.podToken,
  };
}
