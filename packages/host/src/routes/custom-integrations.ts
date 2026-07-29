import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AddCustomIntegrationInput,
  CustomIntegrationManager,
} from "../integrations/custom/manager";
import { CustomIntegrationError } from "../integrations/custom/types";
import type { CredentialVault } from "../ports";
import { bearer, json, readJson } from "./http";

/**
 * Custom-integration SANDBOX routes (HOU-550) — `/sandbox/integrations/custom/*`
 * (per-sandbox HMAC): what the agent's setup tools call — detect a pasted URL,
 * add an integration. The USER routes (list / remove / provide-credential, on
 * three surfaces incl. the per-agent dispatch the hosted gateway proxies) live
 * in custom-integrations-user.ts.
 */
export interface CustomIntegrationDeps {
  customIntegrations?: CustomIntegrationManager;
}

const httpStatusOf = (code: CustomIntegrationError["code"]): number =>
  code === "not_found" ? 404 : code === "duplicate_slug" ? 409 : 400;

/** Map manager failures to stable JSON bodies (the runtime tools + UI classify
 *  on `code`, never bare statuses); rethrow anything unrecognized. */
export function relayCustomError(res: ServerResponse, err: unknown): boolean {
  if (!(err instanceof CustomIntegrationError)) return false;
  json(res, httpStatusOf(err.code), { error: err.message, code: err.code });
  return true;
}

/** The route grammar under `custom/`, shared by every user surface
 *  (custom-integrations-user.ts serves it on three mounts). Anything else
 *  (e.g. `custom/connections`, the generic provider family) is NOT this
 *  family's — `null` falls through to the next handler like a non-match. */
export type CustomTarget =
  | { kind: "detect" }
  | { kind: "definitions" }
  | { kind: "definition"; slug: string }
  | { kind: "credential"; slug: string }
  | { kind: "tools"; slug: string };

const TARGET =
  /^(?:detect|definitions(?:\/([^/]+)(?:\/(credential|tools))?)?)$/;

export function customTargetOf(rest: string): CustomTarget | null {
  const m = rest.match(TARGET);
  if (!m) return null;
  if (rest === "detect") return { kind: "detect" };
  if (!m[1]) return { kind: "definitions" };
  const slug = decodeURIComponent(m[1]);
  if (m[2] === "credential") return { kind: "credential", slug };
  if (m[2] === "tools") return { kind: "tools", slug };
  return { kind: "definition", slug };
}

// ── Sandbox (agent-initiated) routes ─────────────────────────────────────────

/** Validate the discriminated add-input (400 on shape errors — the agent tool
 *  relays the message so the model can correct itself; the manual-add form
 *  never produces one because it builds the body from typed fields). Shared
 *  with the USER add route in custom-integrations-user.ts, so both surfaces
 *  accept the exact same body. */
export function parseAddInput(
  body: Record<string, unknown>,
): AddCustomIntegrationInput | string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return "missing 'name'";
  const auth =
    body.auth === "credential" ? ("credential" as const) : ("none" as const);
  const slug = typeof body.slug === "string" ? body.slug : undefined;
  if (body.kind === "openapi") {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    // An inline document (agent-authored from the service's API docs when no
    // published OpenAPI URL exists) — no network fetch, ever again.
    const inline = typeof body.spec === "string" ? body.spec.trim() : "";
    if (!url && !inline)
      return "missing 'url' (the OpenAPI document URL) or 'spec' (an inline OpenAPI document)";
    return {
      kind: "openapi",
      name,
      spec: inline ? { kind: "blob", value: inline } : { kind: "url", url },
      ...(typeof body.baseUrl === "string" ? { baseUrl: body.baseUrl } : {}),
      auth,
      ...(slug ? { slug } : {}),
    };
  }
  if (body.kind === "mcp") {
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    if (!endpoint) return "missing 'endpoint' (the MCP server URL)";
    return { kind: "mcp", name, endpoint, auth, ...(slug ? { slug } : {}) };
  }
  return "unknown 'kind' (expected 'openapi' or 'mcp')";
}

export async function handleSandboxCustomIntegrations(
  deps: CustomIntegrationDeps & {
    vault: CredentialVault;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const m = path.match(/^\/sandbox\/integrations\/custom\/(detect|add)$/);
  if (!m || method !== "POST") return false;

  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  const manager = deps.customIntegrations;
  if (!manager) {
    // Same stable code the generic sandbox proxy uses, so the runtime tool
    // renders the honest "not available in this install" speech act.
    json(res, 503, {
      error: "custom integrations not configured",
      code: "integrations_not_configured",
    });
    return true;
  }

  const body = await readJson(req);
  try {
    if (m[1] === "detect") {
      if (typeof body.url !== "string" || !body.url.trim()) {
        json(res, 400, { error: "missing 'url'" });
        return true;
      }
      json(res, 200, await manager.detect(body.url.trim()));
      return true;
    }
    const input = parseAddInput(body);
    if (typeof input === "string") {
      json(res, 400, { error: input });
      return true;
    }
    const view = await manager.add(input);
    json(res, 200, view);
    return true;
  } catch (err) {
    if (relayCustomError(res, err)) return true;
    throw err;
  }
}
