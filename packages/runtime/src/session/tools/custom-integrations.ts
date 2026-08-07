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
        "For kind 'openapi' when the service publishes NO OpenAPI document: a complete OpenAPI 3.x document you authored from the service's API docs (JSON or YAML). Include servers[].url, operationIds, and the securityScheme the API requires, and cover EVERY operation the documentation describes - not just the ones today's task needs. Prefer 'url' when one exists.",
    }),
  ),
  endpoint: Type.Optional(
    Type.String({ description: "For kind 'mcp': the MCP server URL." }),
  ),
  auth: Type.Union(
    [Type.Literal("none"), Type.Literal("credential"), Type.Literal("oauth")],
    {
      description:
        "'credential' when the service needs an API key/token (then call request_credential next); 'oauth' (MCP only) when custom_integration_detect reported the server signs in with its own account flow AND said sign-in is supported; 'none' when it is public or the user said no key is needed.",
    },
  ),
  replace: Type.Optional(
    Type.Boolean({
      description:
        "Set true ONLY to fix an integration you already added: the same name swaps in the corrected spec in place, keeping the user's saved API key while the service address is unchanged (a changed address drops the key and asks for it again). Never use it to add something new.",
    }),
  ),
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
  requiresOAuth?: boolean;
  /** Present with `requiresOAuth`: whether THIS deployment can run the
   *  browser sign-in (PRODUCT-1172). */
  oauthSupported?: boolean;
  toolCount?: number;
}

interface AddResponse {
  slug: string;
  name: string;
  auth?: "none" | "credential" | "oauth";
  state:
    | { status: "active"; toolCount: number }
    | { status: "pending" }
    | { status: "error"; message: string };
}

export function makeCustomIntegrationTools(opts: CustomIntegrationToolOptions) {
  const base = opts.baseUrl.replace(/\/$/, "");

  async function post<T>(
    path: "detect" | "add" | "remove",
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
              r.requiresOAuth
                ? r.oauthSupported
                  ? "It signs in with its own account flow (OAuth): add it with auth 'oauth', then call request_credential with its slug in the same turn - the card shows a Sign in button for the user. NEVER collect an API key for it - a key cannot satisfy its sign-in."
                  : "It only signs in with its own account flow, which Houston cannot connect to on this install yet: say so honestly, never collect an API key for it, and check whether the service also offers a plain API-key or documented REST API to connect instead."
                : r.requiresAuthentication
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
          replace: params.replace,
        },
        signal,
      );
      const text =
        r.state.status === "active"
          ? `Added '${r.name}' (slug: ${r.slug}) with ${r.state.toolCount} available actions. Its actions now appear in integration_search results.`
          : r.state.status === "pending"
            ? r.auth === "oauth"
              ? `Added '${r.name}' (slug: ${r.slug}). It is waiting for the user to sign in: call request_credential with toolkit '${r.slug}' now - Houston shows a Sign in card in place of the chat input and messages you automatically once they finish. NEVER ask for an API key for it.`
              : `Added '${r.name}' (slug: ${r.slug}). It is waiting for the user's API key: call request_credential with toolkit '${r.slug}' now so Houston shows a secure entry card - NEVER ask the user to paste a key into the chat.`
            : `Adding '${r.name}' failed: ${r.state.message}`;
      return {
        content: [{ type: "text" as const, text }],
        details: { slug: r.slug, status: r.state.status },
      };
    },
  });

  const RemoveParams = Type.Object({
    slug: Type.String({
      description:
        "The custom integration's slug (from a custom_integration_add result or an earlier setup in this conversation).",
    }),
  });
  type RemoveParams = Static<typeof RemoveParams>;

  const remove = defineTool({
    name: "custom_integration_remove",
    label: "Remove a custom integration",
    description:
      "Remove a custom integration you set up, including its saved key or sign-in. Use it when the user asks to remove one, or to clean up an unfinished setup after switching a service to a different connection method (one integration per service - never leave an abandoned card behind). Never remove a working integration the user did not ask to change.",
    promptSnippet: "Remove a custom integration",
    parameters: RemoveParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: RemoveParams,
      signal: AbortSignal | undefined,
    ) {
      assertNotPlanMode("add or change the user's integrations");
      const slug = params.slug.trim().toLowerCase();
      if (!slug)
        throw new Error("custom_integration_remove needs a non-empty slug.");
      await post<{ ok: boolean }>("remove", { slug }, signal);
      return {
        content: [
          {
            type: "text" as const,
            text: `Removed the custom integration '${slug}' (its saved credential is gone too). Tell the user in plain words - never mention slugs.`,
          },
        ],
        details: { slug },
      };
    },
  });

  return [detect, add, remove, makeRequestCredentialTool()];
}

/** The tool names — pi's allowlist needs the names alongside the objects. */
export const CUSTOM_INTEGRATION_TOOL_NAMES = [
  "custom_integration_detect",
  "custom_integration_add",
  "custom_integration_remove",
  REQUEST_CREDENTIAL_TOOL_NAME,
];
