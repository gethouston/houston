import type { IncomingHttpHeaders } from "node:http";
import {
  type CustomEndpoint,
  ManagedBridgeEndpointSchema,
} from "@houston/protocol";
import { ACTING_AS_HEADER } from "../auth/acting";
import type { SharedEndpointStore } from "../credentials/remote-shared-endpoint-store";
import { checkPublicHttpsEndpoint } from "../custom-endpoint-validation";
import { channelFor, noChannel } from "./agent-authz";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

/**
 * Connect an OpenAI-compatible server: a base URL + model. Desktop/self-host
 * point it at the user's own machine (Ollama / vLLM / LM Studio); a cloud pod
 * points it at a public HTTPS endpoint the user hosts (tunnel or directly
 * hosted). Gated on the deployment capability, then — on the managed cloud
 * profile only — validated against the pod's public-:443-only egress.
 */
defineRoute({
  group: "agent-credentials",
  method: "POST",
  path: "/agents/:agentId/provider/openai-compatible",
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/agents-provider.ts",
  async handler({ deps, authz, actingAs, req, res }) {
    if (!deps.capabilities?.openaiCompatible)
      return json(res, 400, {
        error:
          "This deployment doesn't support custom OpenAI-compatible endpoints.",
      });
    const body = await readJson(req);
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (!baseUrl) return json(res, 400, { error: "missing 'baseUrl'" });
    if (!model) return json(res, 400, { error: "missing 'model'" });
    // Validate the scheme at the boundary (mirrors the runtime's check) so a bad
    // URL is a clean 400 here rather than a 502 bounced off the runtime, and a
    // non-http(s) scheme never reaches the agent's egress.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(baseUrl);
    } catch {
      return json(res, 400, { error: "baseUrl is not a valid URL" });
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")
      return json(res, 400, {
        error: "baseUrl must start with http:// or https://",
      });
    // Managed cloud pods (gatewayFronted) egress ONLY to public TCP 443 — the
    // NetworkPolicy drops private/loopback/link-local and the metadata IP. Reject
    // an unreachable endpoint at save time with an actionable reason rather than
    // failing every turn opaquely. Desktop/self-host (not gateway-fronted) keep
    // accepting localhost, so they skip this check entirely — as does the dev
    // launcher (loopbackEgress), whose "pods" run on the developer's machine
    // and genuinely reach a local model server.
    if (deps.gatewayFronted && !deps.loopbackEgress) {
      const check = checkPublicHttpsEndpoint(parsedUrl);
      // `code` lets the client translate the rule and treat this as an
      // expected state; `error` keeps the English sentence for logs.
      if (!check.ok)
        return json(res, 400, { error: check.reason, code: check.code });
    }
    const channel = channelFor(deps, authz.workspace);
    if (!channel) return noChannel(res, authz.workspace.runtime);
    const bridge =
      body.bridge === undefined
        ? undefined
        : ManagedBridgeEndpointSchema.safeParse(body.bridge);
    if (bridge && !bridge.success)
      return json(res, 400, { error: "invalid bridge descriptor" });
    const endpoint: CustomEndpoint = {
      ...(bridge?.success ? { bridge: bridge.data } : {}),
      baseUrl,
      model,
      name: typeof body.name === "string" ? body.name : undefined,
      contextWindow:
        typeof body.contextWindow === "number" ? body.contextWindow : undefined,
      reasoning:
        typeof body.reasoning === "boolean" ? body.reasoning : undefined,
      shared: body.shared === true ? true : undefined,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    };
    let endpointSaved = false;
    try {
      // The acting identity selects WHOSE credential scope the runtime writes
      // (HOU-976); without it the key landed in the team file while the
      // user's turns read their own (PRODUCT-1807).
      await channel.saveCustomEndpoint(
        { workspace: authz.workspace, agent: authz.agent, actingAs },
        endpoint,
      );
      endpointSaved = true;
      // The gateway validates every bridge inference against the endpoint file
      // in object storage; the desktop probes the model right after this 200,
      // so the file must be there before we answer — not 5 minutes later.
      await deps.storeSyncFlush?.();
      if (deps.gatewayFronted && deps.sharedEndpoints)
        await shareEndpoint(deps.sharedEndpoints, endpoint, req.headers);
      json(res, 200, { ok: true });
    } catch (err) {
      if (endpointSaved && deps.gatewayFronted && deps.sharedEndpoints)
        console.error("[shared-endpoint] save synchronization failed:", err);
      json(res, 502, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

/** Publish (or retract) the org-visible copy of a just-saved endpoint. */
async function shareEndpoint(
  store: SharedEndpointStore,
  endpoint: CustomEndpoint,
  headers: IncomingHttpHeaders,
): Promise<void> {
  if (endpoint.shared !== true) {
    await store.remove({ ownerOnly: true });
    return;
  }
  const acting = headers[ACTING_AS_HEADER];
  await store.put(
    {
      ...(endpoint.bridge ? { bridge: endpoint.bridge } : {}),
      baseUrl: endpoint.baseUrl,
      model: endpoint.model,
      ...(endpoint.name !== undefined ? { name: endpoint.name } : {}),
      ...(endpoint.contextWindow !== undefined
        ? { contextWindow: endpoint.contextWindow }
        : {}),
      ...(endpoint.reasoning !== undefined
        ? { reasoning: endpoint.reasoning }
        : {}),
      ...(endpoint.apiKey !== undefined ? { apiKey: endpoint.apiKey } : {}),
    },
    typeof acting === "string" ? acting : undefined,
  );
}
