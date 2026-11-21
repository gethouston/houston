import type { ApiKeyAuthTemplate } from "@executor-js/plugin-openapi/core";
import { variable } from "@executor-js/plugin-openapi/core";
import type { CustomIntegrationDef } from "./types";

export const FALLBACK_AUTH_SLUG = "houston_fallback";

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
