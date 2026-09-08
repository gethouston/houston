import {
  LocalBridgeDescriptorSchema,
  LocalBridgeLegacyEndpointSchema,
  LocalBridgeRegisterSchema,
  LocalBridgeRemoteStatusSchema,
  LocalBridgeSessionSchema,
} from "@houston/protocol";
import type { LocalModelBridgeAccess } from "../../../../../ui/engine-client/src/local-model-bridge";
import { emitEvent } from "../bus";
import { scopedBridgeFetch } from "../cp/bridge-fetch";
import type { AdapterContext } from "./context";
import { HoustonEngineError } from "./errors";
import { fetchCapabilities } from "./host-capabilities";
import { requireProviderAgentId } from "./provider-routing";

const prefix = "/v1/local-model-bridges";
const pathFor = (id: string) => `${prefix}/${encodeURIComponent(id)}`;

export async function localModelBridgeAccess(
  ctx: AdapterContext,
  userId: string,
): Promise<LocalModelBridgeAccess | null> {
  const baseUrl = ctx.baseUrl;
  const selectedOrg = ctx.cp?.activeOrgSlug ?? null;
  const hostname = new URL(baseUrl).hostname;
  const capabilities = await fetchCapabilities(ctx);
  if (
    ctx.baseUrl !== baseUrl ||
    (ctx.cp?.activeOrgSlug ?? null) !== selectedOrg
  ) {
    throw new Error("Local model workspace changed");
  }
  if (!capabilities.localModelBridge?.versions.includes(1)) {
    if (
      capabilities.profile === "local" &&
      !capabilities.multiplayer &&
      !capabilities.tunnel &&
      ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
    )
      return null;
    throw new HoustonEngineError(503, {
      code: "bridge_not_supported",
      error: "This server does not support local model connections.",
    });
  }
  if (!ctx.cp)
    throw new HoustonEngineError(503, {
      code: "bridge_not_supported",
      error: "This server does not support local model connections.",
    });
  const agentId = requireProviderAgentId(ctx);
  const fetch = scopedBridgeFetch(ctx.cp, userId);
  const org: unknown = await (await fetch("/v1/org")).json();
  if (
    !org ||
    typeof org !== "object" ||
    !("id" in org) ||
    typeof org.id !== "string"
  ) {
    throw new Error("Invalid workspace identity in local model response");
  }
  const orgId = org.id;
  return {
    identity: { environment: baseUrl, userId, orgId, agentId },
    async register(input, signal) {
      if (input.agentId !== agentId)
        throw new Error("Local model agent changed");
      const response = await fetch(prefix, {
        method: "POST",
        body: JSON.stringify(LocalBridgeRegisterSchema.parse(input)),
        signal,
      });
      const descriptor = LocalBridgeDescriptorSchema.parse(
        await response.json(),
      );
      if (descriptor.orgId !== orgId || descriptor.userId !== userId)
        throw new Error("Local model response identity mismatch");
      return descriptor;
    },
    async session(id, device, signal, generation) {
      const response = await fetch(`${pathFor(id)}/sessions`, {
        method: "POST",
        body: JSON.stringify({
          ...device,
          ...(generation === undefined ? {} : { generation }),
        }),
        signal,
      });
      const session = LocalBridgeSessionSchema.parse(await response.json());
      const url = new URL(session.connectUrl);
      const origin = new URL(baseUrl);
      if (
        session.bridgeId !== id ||
        url.host !== origin.host ||
        url.pathname !== `${pathFor(id)}/connect` ||
        url.search ||
        url.hash ||
        url.username ||
        url.password ||
        (url.protocol !== "wss:" &&
          !(
            import.meta.env.DEV &&
            url.protocol === "ws:" &&
            origin.protocol === "http:"
          ))
      ) {
        throw new Error("Invalid local model session destination");
      }
      return session;
    },
    async status(id, signal) {
      const response = await fetch(pathFor(id), { signal });
      const status = LocalBridgeRemoteStatusSchema.parse(await response.json());
      if (status.bridgeId !== id || status.orgId !== orgId)
        throw new Error("Local model response identity mismatch");
      return status;
    },
    async revoke(id, signal) {
      await fetch(pathFor(id), { method: "DELETE", signal });
    },
    async legacyEndpoint(signal) {
      const response = await fetch(
        `${prefix}/legacy?agentId=${encodeURIComponent(agentId)}`,
        { signal },
      );
      return LocalBridgeLegacyEndpointSchema.nullable().parse(
        await response.json(),
      );
    },
    async clearEndpoint(signal) {
      await fetch(`/agents/${encodeURIComponent(agentId)}/credential/forget`, {
        method: "POST",
        body: JSON.stringify({ provider: "openai-compatible" }),
        signal,
      });
      await fetch(
        `/agents/${encodeURIComponent(agentId)}/auth/openai-compatible/logout`,
        {
          method: "POST",
          signal,
        },
      );
    },
    async saveEndpoint(endpoint, signal) {
      await fetch(
        `/agents/${encodeURIComponent(agentId)}/provider/openai-compatible`,
        { method: "POST", body: JSON.stringify(endpoint), signal },
      );
      await fetch(`/agents/${encodeURIComponent(agentId)}/settings/claim`, {
        method: "POST",
        body: JSON.stringify({ provider: "openai-compatible" }),
        signal,
      });
      emitEvent("ProviderLoginComplete", {
        provider: "openai-compatible",
        success: true,
        error: null,
      });
    },
  };
}
