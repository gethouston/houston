import type {
  CustomIntegrationAuth,
  CustomIntegrationConfig,
} from "@houston-ai/engine-client";

/**
 * The pure form model for custom API-key integrations: DOM-free so the form,
 * the dialog, and the tests share ONE source of truth for how values map to the
 * wire `CustomIntegrationConfig` and validate. The client checks mirror the
 * gateway's rules for inline errors; the gateway stays the real authority.
 */

/** The auth scheme the select offers: an injected header, or a query param. */
export type CustomAuthType = "header" | "query";

/**
 * Header-prefix presets. `bearer` sends `"Bearer "`, `none` sends no prefix,
 * `custom` sends whatever the user types (verbatim, e.g. `"Token "`).
 */
export type PrefixPreset = "bearer" | "none" | "custom";
export const PREFIX_PRESETS: readonly PrefixPreset[] = [
  "bearer",
  "none",
  "custom",
];

/** The literal prefix a preset maps to (`custom` uses the typed value). */
export function presetPrefix(preset: PrefixPreset, typed: string): string {
  if (preset === "bearer") return "Bearer ";
  if (preset === "none") return "";
  return typed;
}

/** Which field an inline validation error attaches to. */
export type CustomFieldError =
  | "name"
  | "baseUrl"
  | "description"
  | "authField"
  | "authPrefix"
  | "apiKey";

/** The mutable form state (a superset of both auth schemes). */
export interface CustomFormValues {
  name: string;
  baseUrl: string;
  description: string;
  authType: CustomAuthType;
  headerName: string;
  prefixPreset: PrefixPreset;
  customPrefix: string;
  queryParam: string;
  apiKey: string;
}

/** A fresh create form: sensible header defaults (Authorization + Bearer). */
export function emptyCustomForm(): CustomFormValues {
  return {
    name: "",
    baseUrl: "",
    description: "",
    authType: "header",
    headerName: "Authorization",
    prefixPreset: "bearer",
    customPrefix: "",
    queryParam: "",
    apiKey: "",
  };
}

/**
 * An edit form: the fields the connection wire actually carries (name +
 * description) prefilled, everything secret or unexposed (baseUrl, auth, key)
 * left blank so an untouched field is OMITTED from the patch and the stored
 * value is kept. Header defaults blank so "not provided" is unambiguous.
 */
export function editCustomForm(initial: {
  name: string;
  description: string;
}): CustomFormValues {
  return {
    name: initial.name,
    baseUrl: "",
    description: initial.description,
    authType: "header",
    headerName: "",
    prefixPreset: "bearer",
    customPrefix: "",
    queryParam: "",
    apiKey: "",
  };
}

const HEADER_RE = /^[A-Za-z0-9-]{1,64}$/;
const QUERY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PREFIX = 16;
const MAX_KEY = 4096;

/** Build the wire auth object from the form's auth fields. */
export function buildAuth(v: CustomFormValues): CustomIntegrationAuth {
  if (v.authType === "query") {
    return { type: "query", param: v.queryParam.trim() };
  }
  const prefix = presetPrefix(v.prefixPreset, v.customPrefix);
  const header = v.headerName.trim();
  return prefix
    ? { type: "header", header, prefix }
    : { type: "header", header };
}

/** Why an https base URL is rejected (`null` = ok). Shared by both validators. */
export function baseUrlError(
  raw: string,
): "invalid" | "not_https" | "has_credentials" | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid";
  }
  if (url.protocol !== "https:") return "not_https";
  if (url.username || url.password) return "has_credentials";
  return null;
}

function authFieldError(v: CustomFormValues): CustomFieldError | null {
  if (v.authType === "header") {
    if (!HEADER_RE.test(v.headerName.trim())) return "authField";
    if (presetPrefix(v.prefixPreset, v.customPrefix).length > MAX_PREFIX)
      return "authPrefix";
    return null;
  }
  return QUERY_RE.test(v.queryParam.trim()) ? null : "authField";
}

/** The auth field the user must fill for the chosen scheme (empty = untouched). */
function authInput(v: CustomFormValues): string {
  return v.authType === "header" ? v.headerName.trim() : v.queryParam.trim();
}

export type CreateResult =
  | { ok: true; config: CustomIntegrationConfig; apiKey: string }
  | { ok: false; field: CustomFieldError };

/** Validate a CREATE: every field required, including the API key. */
export function validateCreate(v: CustomFormValues): CreateResult {
  const name = v.name.trim();
  if (name.length < 1 || name.length > 64) return { ok: false, field: "name" };
  const baseUrl = v.baseUrl.trim();
  if (baseUrlError(baseUrl)) return { ok: false, field: "baseUrl" };
  const description = v.description.trim();
  if (description.length < 1 || description.length > 500)
    return { ok: false, field: "description" };
  const authErr = authFieldError(v);
  if (authErr) return { ok: false, field: authErr };
  if (v.apiKey.length < 1 || v.apiKey.length > MAX_KEY)
    return { ok: false, field: "apiKey" };
  return {
    ok: true,
    config: { name, baseUrl, auth: buildAuth(v), description },
    apiKey: v.apiKey,
  };
}

export type CustomPatch = Partial<CustomIntegrationConfig> & {
  apiKey?: string;
};
export type PatchResult =
  | { ok: true; patch: CustomPatch }
  | { ok: false; field: CustomFieldError };

/**
 * Validate an EDIT into a PATCH: name + description are always sent (they were
 * prefilled); baseUrl, auth, and apiKey are included ONLY when the user actually
 * entered them, so an untouched secret/URL keeps its stored value ("blank =
 * keep"), since the connection wire never exposes them to prefill.
 */
export function validateEdit(v: CustomFormValues): PatchResult {
  const name = v.name.trim();
  if (name.length < 1 || name.length > 64) return { ok: false, field: "name" };
  const description = v.description.trim();
  if (description.length < 1 || description.length > 500)
    return { ok: false, field: "description" };
  const patch: CustomPatch = { name, description };
  const baseUrl = v.baseUrl.trim();
  if (baseUrl.length > 0) {
    if (baseUrlError(baseUrl)) return { ok: false, field: "baseUrl" };
    patch.baseUrl = baseUrl;
  }
  if (authInput(v).length > 0) {
    const authErr = authFieldError(v);
    if (authErr) return { ok: false, field: authErr };
    patch.auth = buildAuth(v);
  }
  if (v.apiKey.length > 0) {
    if (v.apiKey.length > MAX_KEY) return { ok: false, field: "apiKey" };
    patch.apiKey = v.apiKey;
  }
  return { ok: true, patch };
}
