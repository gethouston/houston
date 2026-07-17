import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { assertNotPlanMode } from "../live-mode-gate";
import {
  makeRequestCredentialTool,
  REQUEST_CREDENTIAL_TOOL_NAME,
} from "./request-credential";

export { REQUEST_CREDENTIAL_TOOL_NAME };

/**
 * The agent's setup tools for CUSTOM integrations (HOU-550): connect an API or
 * MCP server that the app catalog doesn't offer. The agent interviews the user
 * (which service? its docs/spec URL? does it need a key?), then drives these
 * tools; the user never handles the machinery.
 *
 * Same trust posture as the generic integration tools: no credential is ever
 * held here — detect/add proxy to the host's /sandbox/integrations/custom/*
 * under the per-sandbox HMAC token, and the SECRET travels only through the
 * secure card `request_credential` queues (the user types it into Houston's
 * UI, which posts it straight to the host — it never enters the transcript).
 */

const DetectParams = Type.Object({
  url: Type.String({
    description:
      "A URL the user provided for the service: an OpenAPI/Swagger document URL, an API docs page, or an MCP server endpoint. Houston inspects it and reports what it is.",
  }),
});
type DetectParams = Static<typeof DetectParams>;

const AddParams = Type.Object({
  kind: Type.Union([Type.Literal("openapi"), Type.Literal("mcp")], {
    description:
      "What custom_integration_detect reported: 'openapi' for a spec-described HTTP API, 'mcp' for an MCP server.",
  }),
  name: Type.String({
    description:
      "A short human name for the integration, e.g. 'Acme CRM'. Shown to the user in Houston's Integrations page.",
  }),
  url: Type.Optional(
    Type.String({
      description: "For kind 'openapi': the OpenAPI document URL.",
    }),
  ),
  spec: Type.Optional(
    Type.String({
      description:
        "For kind 'openapi' when the service publishes NO OpenAPI document: a complete OpenAPI 3.x document you authored from the service's API docs (JSON or YAML). Include servers[].url, operationIds, and the securityScheme the API requires. Prefer 'url' when one exists.",
    }),
  ),
  endpoint: Type.Optional(
    Type.String({ description: "For kind 'mcp': the MCP server URL." }),
  ),
  auth: Type.Union([Type.Literal("none"), Type.Literal("credential")], {
    description:
      "'credential' when the service needs an API key/token (then call request_credential next); 'none' when it is public or the user said no key is needed.",
  }),
});
type AddParams = Static<typeof AddParams>;

export interface CustomIntegrationToolOptions {
  baseUrl: string;
  sandboxToken: string;
}

interface DetectResponse {
  kind: "openapi" | "mcp" | "unknown";
  name?: string;
  suggestedSlug?: string;
  requiresAuthentication?: boolean;
  toolCount?: number;
}

interface AddResponse {
  slug: string;
  name: string;
  state:
    | { status: "active"; toolCount: number }
    | { status: "pending" }
    | { status: "error"; message: string };
}

export function makeCustomIntegrationTools(opts: CustomIntegrationToolOptions) {
  const base = opts.baseUrl.replace(/\/$/, "");

  async function post<T>(
    path: "detect" | "add",
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    const res = await fetch(`${base}/sandbox/integrations/custom/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.sandboxToken}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // The host's error bodies are already agent-actionable (invalid URL,
      // duplicate name, spec failed to compile) — relay them for self-repair.
      throw new Error(
        `custom integration ${path} failed (${res.status}): ${detail.slice(0, 300)}`,
      );
    }
    return (await res.json()) as T;
  }

  const detect = defineTool({
    name: "custom_integration_detect",
    label: "Inspect a service URL",
    description:
      "Inspect a URL the user provided for a service Houston's app search does not offer: an OpenAPI/Swagger document, or an MCP server endpoint. Reports what it is, a suggested name, and whether it needs an API key. Call this BEFORE custom_integration_add.",
    promptSnippet: "Inspect a URL to set up a custom integration",
    parameters: DetectParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: DetectParams,
      signal: AbortSignal | undefined,
    ) {
      const r = await post<DetectResponse>(
        "detect",
        { url: params.url },
        signal,
      );
      const text =
        r.kind === "unknown"
          ? "This URL is neither a readable OpenAPI document nor a reachable MCP server. Ask the user for the service's API documentation URL (an OpenAPI/Swagger JSON or YAML link) or its MCP server URL - do not guess one."
          : [
              `Detected: ${r.kind === "openapi" ? "an OpenAPI-described HTTP API" : "an MCP server"}.`,
              r.name ? `Name: ${r.name}.` : "",
              r.toolCount != null ? `It exposes ${r.toolCount} tools.` : "",
              r.requiresAuthentication
                ? "It requires authentication - after adding it, call request_credential so the user can enter their key securely."
                : "",
              `Next: call custom_integration_add with kind '${r.kind}'.`,
            ]
              .filter(Boolean)
              .join(" ");
      return {
        content: [{ type: "text" as const, text }],
        details: { kind: r.kind },
      };
    },
  });

  const add = defineTool({
    name: "custom_integration_add",
    label: "Add a custom integration",
    description:
      "Add a custom integration from a detected URL so its actions become available in integration_search. Use auth 'credential' when the service needs an API key/token (then call request_credential in the same turn); 'none' when public. On success, tell the user it is set up in plain words - never mention specs, slugs, or endpoints.",
    promptSnippet: "Add a custom integration from a URL",
    parameters: AddParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: AddParams,
      signal: AbortSignal | undefined,
    ) {
      // Live gate for the mid-turn Mode-pill switch: adding an integration
      // changes the user's setup — off-limits once they switched to Plan.
      assertNotPlanMode("add or change the user's integrations");
      const r = await post<AddResponse>(
        "add",
        {
          kind: params.kind,
          name: params.name,
          url: params.url,
          spec: params.spec,
          endpoint: params.endpoint,
          auth: params.auth,
        },
        signal,
      );
      const text =
        r.state.status === "active"
          ? `Added '${r.name}' (slug: ${r.slug}) with ${r.state.toolCount} available actions. Its actions now appear in integration_search results.`
          : r.state.status === "pending"
            ? `Added '${r.name}' (slug: ${r.slug}). It is waiting for the user's API key: call request_credential with toolkit '${r.slug}' now so Houston shows a secure entry card - NEVER ask the user to paste a key into the chat.`
            : `Adding '${r.name}' failed: ${r.state.message}`;
      return {
        content: [{ type: "text" as const, text }],
        details: { slug: r.slug, status: r.state.status },
      };
    },
  });

  return [detect, add, makeRequestCredentialTool()];
}

/** The tool names — pi's allowlist needs the names alongside the objects. */
export const CUSTOM_INTEGRATION_TOOL_NAMES = [
  "custom_integration_detect",
  "custom_integration_add",
  REQUEST_CREDENTIAL_TOOL_NAME,
];
