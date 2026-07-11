import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  AddCustomIntegrationInput,
  CustomIntegrationManager,
} from "../integrations/custom/manager";
import { CustomIntegrationError } from "../integrations/custom/types";
import type { LocalIntegrationGrants } from "../integrations/grants";
import type { CredentialVault } from "../ports";
import { bearer, json, readJson } from "./http";

/**
 * Custom-integration management routes (HOU-550), split by caller:
 *
 *  - USER routes (`/v1/integrations/custom/definitions*`, signed-in user):
 *    list / remove / provide-credential — what the Integrations page and the
 *    in-chat credential card call. The credential value crosses ONLY here
 *    (HTTPS body → secret store); it never rides the chat transcript.
 *  - SANDBOX routes (`/sandbox/integrations/custom/*`, per-sandbox HMAC): what
 *    the agent's setup tools call — detect a pasted URL, add an integration.
 *
 * Both mounted BEFORE the generic `/v1/integrations/:provider/*` handler in
 * server.ts (its catch-all would 404 the `custom/definitions` subpaths).
 */
export interface CustomIntegrationDeps {
  customIntegrations?: CustomIntegrationManager;
}

const httpStatusOf = (code: CustomIntegrationError["code"]): number =>
  code === "not_found" ? 404 : code === "duplicate_slug" ? 409 : 400;

/** Map manager failures to stable JSON bodies (the runtime tools + UI classify
 *  on `code`, never bare statuses); rethrow anything unrecognized. */
function relayCustomError(res: ServerResponse, err: unknown): boolean {
  if (!(err instanceof CustomIntegrationError)) return false;
  json(res, httpStatusOf(err.code), { error: err.message, code: err.code });
  return true;
}

export async function handleCustomIntegrations(
  deps: CustomIntegrationDeps,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (!path.startsWith("/v1/integrations/custom/definitions")) return false;
  const manager = deps.customIntegrations;
  if (!manager) {
    json(res, 404, { error: "custom integrations not available here" });
    return true;
  }

  try {
    if (path === "/v1/integrations/custom/definitions" && method === "GET") {
      json(res, 200, { items: await manager.list() });
      return true;
    }

    const m = path.match(
      /^\/v1\/integrations\/custom\/definitions\/([^/]+)(\/credential)?$/,
    );
    if (!m) return false;
    const slug = decodeURIComponent(m[1] ?? "");

    if (!m[2] && method === "DELETE") {
      await manager.remove(slug);
      json(res, 200, { ok: true });
      return true;
    }
    if (m[2] && method === "POST") {
      const body = await readJson(req);
      const values = body.values;
      if (
        !values ||
        typeof values !== "object" ||
        Array.isArray(values) ||
        !Object.values(values).every((v) => typeof v === "string")
      ) {
        json(res, 400, { error: "missing 'values' (object of strings)" });
        return true;
      }
      json(
        res,
        200,
        await manager.setCredential(slug, values as Record<string, string>),
      );
      return true;
    }
  } catch (err) {
    if (relayCustomError(res, err)) return true;
    throw err;
  }
  return false;
}

// ── Sandbox (agent-initiated) routes ─────────────────────────────────────────

/** Validate the discriminated add-input from the model (400 on shape errors —
 *  the tool relays the message so the model can correct itself). */
function parseAddInput(
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
    integrationGrants?: LocalIntegrationGrants;
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
    // Auto-grant the new integration to the agent that created it (mirrors
    // the connect card's auto-grant): an agent whose grant record predates
    // this add would otherwise be filtered away from its own creation. A
    // record-less agent needs nothing — no record means no filtering yet.
    if (deps.integrationGrants) {
      const granted = await deps.integrationGrants.grantedOrNull(claim.agentId);
      if (granted && !granted.includes(view.slug)) {
        await deps.integrationGrants.replace(claim.agentId, [
          ...granted,
          view.slug,
        ]);
      }
    }
    json(res, 200, view);
    return true;
  } catch (err) {
    if (relayCustomError(res, err)) return true;
    throw err;
  }
}
