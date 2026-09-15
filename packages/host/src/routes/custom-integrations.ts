import type { IncomingMessage, ServerResponse } from "node:http";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import { CustomIntegrationError } from "../integrations/custom/types";
import type { CredentialVault } from "../ports";
import { parseAddInput } from "./custom-integrations-input";
import { bearer, json, readJson } from "./http";
import { defineRouteFamily } from "./registry";

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

defineRouteFamily({
  group: "sandbox-custom-integrations",
  members: [
    { method: "POST", path: "/sandbox/integrations/custom/detect" },
    { method: "POST", path: "/sandbox/integrations/custom/add" },
    { method: "POST", path: "/sandbox/integrations/custom/remove" },
    { method: "POST", path: "/sandbox/integrations/custom/status" },
  ],
  phase: "sandbox",
  classification: "internal-sandbox",
  reason:
    "The agent's setup tools call these with a per-sandbox HMAC token; the user surfaces live in custom-integrations-user.ts.",
  source: "packages/host/src/routes/custom-integrations.ts",
  handler: ({ deps, method, path, url, req, res }) =>
    handleSandboxCustomIntegrations(deps, method, path, url, req, res),
});

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
