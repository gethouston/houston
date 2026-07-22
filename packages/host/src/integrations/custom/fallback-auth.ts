import type { ApiKeyAuthTemplate } from "@executor-js/plugin-openapi/core";
import { variable } from "@executor-js/plugin-openapi/core";
import type { CustomIntegrationDef } from "./types";

/**
 * Synthesized auth method for credential-mode OpenAPI defs whose spec declares
 * NO collectible security scheme. Real-world specs frequently model the API
 * key as a plain header parameter (or omit auth entirely — agent-authored
 * minimal specs), which used to dead-end the secure credential save with
 * `credential_invalid` while pasting the key in chat worked. The fallback
 * gives the key a placement: the spec's own api-key-shaped parameter when one
 * exists, else the `Authorization: Bearer` default (the same default the MCP
 * path already uses).
 */

/** Stable method slug — persisted as `def.credential.template`, so every
 *  executor rebuild must re-inject the SAME slug before reconnecting. */
export const FALLBACK_AUTH_SLUG = "houston_fallback";

/** Api-key-shaped parameter names, compared with separators stripped and an
 *  optional leading `x` removed (`X-API-Key` → `apikey`). */
const KEY_NAMES = new Set([
  "apikey",
  "apitoken",
  "authtoken",
  "accesstoken",
  "token",
  "key",
]);

function isKeyName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[-_]/g, "");
  if (KEY_NAMES.has(normalized)) return true;
  return normalized.startsWith("x") && KEY_NAMES.has(normalized.slice(1));
}

interface ParamHint {
  in: "header" | "query";
  name: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Read one OpenAPI parameter object (or a `#/components/parameters/…` ref,
 *  resolved against the doc) down to the `{in, name}` pair we care about. */
function paramOf(
  entry: unknown,
  componentParams: Record<string, unknown>,
): ParamHint | null {
  if (!isRecord(entry)) return null;
  const resolved =
    typeof entry.$ref === "string"
      ? componentParams[entry.$ref.split("/").at(-1) ?? ""]
      : entry;
  if (!isRecord(resolved)) return null;
  const where = resolved.in;
  const name = resolved.name;
  if ((where !== "header" && where !== "query") || typeof name !== "string") {
    return null;
  }
  return { in: where, name };
}

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "head",
  "options",
  "trace",
];

/** Every header/query parameter the document declares, in document order:
 *  component-level, then per-path shared, then per-operation. */
function collectParams(doc: Record<string, unknown>): ParamHint[] {
  const components = isRecord(doc.components) ? doc.components : {};
  const componentParams = isRecord(components.parameters)
    ? components.parameters
    : {};
  const out: ParamHint[] = [];
  const push = (entries: unknown) => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      const hint = paramOf(entry, componentParams);
      if (hint) out.push(hint);
    }
  };
  for (const value of Object.values(componentParams)) push([value]);
  const paths = isRecord(doc.paths) ? doc.paths : {};
  for (const item of Object.values(paths)) {
    if (!isRecord(item)) continue;
    push(item.parameters);
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (isRecord(op)) push(op.parameters);
    }
  }
  return out;
}

/** The best placement hint an inline JSON spec offers, or null. Priority: a
 *  specific api-key header, then an `Authorization` header, then an api-key
 *  query param. YAML blobs and url-sourced specs offer none (null). */
function specKeyHint(def: CustomIntegrationDef): ParamHint | null {
  if (def.kind !== "openapi" || def.spec.kind !== "blob") return null;
  let doc: unknown;
  try {
    doc = JSON.parse(def.spec.value);
  } catch {
    return null;
  }
  if (!isRecord(doc)) return null;
  const params = collectParams(doc);
  const headerKey = params.find((p) => p.in === "header" && isKeyName(p.name));
  if (headerKey) return headerKey;
  const authHeader = params.find(
    (p) => p.in === "header" && p.name.toLowerCase() === "authorization",
  );
  if (authHeader) return authHeader;
  return params.find((p) => p.in === "query" && isKeyName(p.name)) ?? null;
}

/**
 * The fallback method in the plugin's request-shaped authoring dialect, ready
 * for `executor.openapi.configure(slug, {authenticationTemplate: [...]})`.
 * Renders the single `token` variable into the derived placement; an
 * `Authorization` header (hinted or default) gets the `Bearer ` prefix.
 */
export function fallbackAuthTemplate(
  def: CustomIntegrationDef,
): ApiKeyAuthTemplate {
  const hint = specKeyHint(def);
  if (hint && hint.in === "query") {
    return {
      slug: FALLBACK_AUTH_SLUG,
      type: "apiKey",
      queryParams: { [hint.name]: [variable("token")] },
    };
  }
  const header = hint?.name ?? "Authorization";
  const bearer = header.toLowerCase() === "authorization";
  return {
    slug: FALLBACK_AUTH_SLUG,
    type: "apiKey",
    headers: {
      [header]: bearer ? ["Bearer ", variable("token")] : [variable("token")],
    },
  };
}
