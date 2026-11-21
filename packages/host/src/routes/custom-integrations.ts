import type { IncomingMessage, ServerResponse } from "node:http";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import type { CredentialVault } from "../ports";
import { parseAddInput } from "./custom-integrations-input";
import { bearer, json, readJson } from "./http";
import { defineRouteFamily } from "./registry";

export interface CustomIntegrationDeps {
  customIntegrations?: CustomIntegrationManager;
}

export { relayCustomError } from "./custom-integrations-error";

import { relayCustomError } from "./custom-integrations-error";

export async function bodyOr400(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await readJson(req);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {}
  json(res, 400, { error: "invalid JSON body" });
  return null;
}

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
    return null;
  }
  if (m[2] === "credential") return { kind: "credential", slug };
  if (m[2] === "tools") return { kind: "tools", slug };
  if (m[2] === "oauth/start") return { kind: "oauthStart", slug };
  return { kind: "definition", slug };
}

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
