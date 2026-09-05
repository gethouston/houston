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

/** A malformed client body must never 500: parse failures (and non-object
 *  JSON like `null`) answer 400 and report "already responded" via `null`. */
export async function bodyOr400(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await readJson(req);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // fall through to the 400 below
  }
  json(res, 400, { error: "invalid JSON body" });
  return null;
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
  | { kind: "tools"; slug: string }
  | { kind: "oauthStart"; slug: string };

const TARGET =
  /^(?:detect|definitions(?:\/([^/]+)(?:\/(credential|tools|oauth\/start))?)?)$/;

export function customTargetOf(rest: string): CustomTarget | null {
  const m = rest.match(TARGET);
  if (!m) return null;
  if (rest === "detect") return { kind: "detect" };
  if (!m[1]) return { kind: "definitions" };
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]);
  } catch {
    // A malformed escape (`%zz`) is not a route of ours — fall through like
    // any non-match instead of letting the URIError become a raw 500.
    return null;
  }
  if (m[2] === "credential") return { kind: "credential", slug };
  if (m[2] === "tools") return { kind: "tools", slug };
  if (m[2] === "oauth/start") return { kind: "oauthStart", slug };
  return { kind: "definition", slug };
}

// ── Sandbox (agent-initiated) routes ─────────────────────────────────────────

/** Validate the discriminated add-input (400 on shape errors — the agent tool
 *  relays the message so the model can correct itself; the manual-add form
 *  never produces one because it builds the body from typed fields). Shared
 *  with the USER add route in custom-integrations-user.ts, so both surfaces
 *  accept the exact same body. */
/** Static request headers for an MCP definition: a small map of plain
 *  header names to short values. Never a credential — `Authorization` (and
 *  any cookie) is refused here so a secret can only travel through the
 *  credential save, where it lands in the vault instead of the def file. */
function parseStaticHeaders(raw: unknown): Record<string, string> | string {
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return "'headers' must be an object of header names to values";
  }
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name)) {
      return `'headers' has an invalid header name '${name}'`;
    }
    if (
      ["authorization", "cookie", "proxy-authorization"].includes(
        name.toLowerCase(),
      )
    ) {
      return `'headers' must not carry '${name}' - save secrets as the credential instead`;
    }
    if (typeof value !== "string" || !value.trim() || value.length > 256) {
      return `'headers' value for '${name}' must be a short non-empty string`;
    }
    headers[name] = value.trim();
  }
  if (Object.keys(headers).length > 8)
    return "'headers' lists too many headers";
  return headers;
}

export function parseAddInput(
  body: Record<string, unknown>,
): AddCustomIntegrationInput | string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return "missing 'name'";
  if (body.auth === "oauth" && body.kind !== "mcp") {
    return "auth 'oauth' is only supported for MCP servers";
  }
  const auth =
    body.auth === "credential"
      ? ("credential" as const)
      : body.auth === "oauth"
        ? ("oauth" as const)
        : ("none" as const);
  const slug = typeof body.slug === "string" ? body.slug : undefined;
  // The brand website for the card's icon (cosmetic; non-http values are
  // simply dropped — icon derivation guards again anyway).
  const website =
    typeof body.website === "string" &&
    /^https?:\/\//i.test(body.website.trim())
      ? body.website.trim()
      : undefined;
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
      ...(website ? { website } : {}),
      auth,
      ...(slug ? { slug } : {}),
      ...(body.replace === true ? { replace: true } : {}),
    };
  }
  if (body.kind === "mcp") {
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    if (!endpoint) return "missing 'endpoint' (the MCP server URL)";
    const headers = parseStaticHeaders(body.headers);
    if (typeof headers === "string") return headers;
    return {
      kind: "mcp",
      name,
      endpoint,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(website ? { website } : {}),
      auth,
      ...(slug ? { slug } : {}),
      ...(body.replace === true ? { replace: true } : {}),
    };
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
  const m = path.match(
    /^\/sandbox\/integrations\/custom\/(detect|add|remove|status)$/,
  );
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
    // The pre-flight behind `request_credential` (PRODUCT-1292): the runtime
    // refuses to queue a secure key card for a slug with no definition — the
    // card used to render anyway and every save 404ed at this host, a
    // user-facing dead end the agent never heard about.
    if (m[1] === "status") {
      if (typeof body.slug !== "string" || !body.slug.trim()) {
        json(res, 400, { error: "missing 'slug'" });
        return true;
      }
      const slug = body.slug.trim();
      const view = (await manager.list()).find((v) => v.slug === slug);
      if (!view) {
        json(res, 404, {
          error: `no custom integration '${slug}'`,
          code: "not_found",
        });
        return true;
      }
      json(res, 200, view);
      return true;
    }
    // The agent's cleanup path (PRODUCT-1172 follow-up): switching a service
    // between connection methods can need a cross-kind re-add, which
    // `replace` refuses by design — the abandoned definition is removed
    // instead of lingering as a dead card.
    if (m[1] === "remove") {
      if (typeof body.slug !== "string" || !body.slug.trim()) {
        json(res, 400, { error: "missing 'slug'" });
        return true;
      }
      await manager.remove(body.slug.trim());
      json(res, 200, { ok: true });
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
