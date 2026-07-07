import type { McpServerAuth, McpServerConfig } from "@houston-ai/engine-client";
import { baseUrlError } from "./custom-integration-model.ts";

/**
 * The pure form model for remote MCP server integrations: DOM-free so the form,
 * the dialog, and the tests share ONE source of truth for how values map to the
 * wire `McpServerConfig` (+ the separate secret `authValue`) and validate. The
 * client checks mirror the gateway's rules for inline errors; the gateway stays
 * the real authority. The https / no-credentials URL rule is REUSED from the
 * custom-integration model rather than duplicated.
 */

/** How the gateway authenticates to the server (matches the wire `McpServerAuth`). */
export type McpAuthType = "none" | "bearer" | "header";

/**
 * The auth choice the select offers. Edit mode adds `keep`: leave the stored
 * auth (type, header, and secret) untouched. A plain select cannot tell "chose
 * the default" from "left it alone", so `keep` is an explicit option — there is
 * no ambiguous sentinel.
 */
export type McpAuthMode = McpAuthType | "keep";
export const MCP_AUTH_TYPES: readonly McpAuthType[] = [
  "none",
  "bearer",
  "header",
];

/** Which field an inline validation error attaches to. */
export type McpFieldError =
  | "name"
  | "url"
  | "description"
  | "authHeader"
  | "authValue";

/** The mutable form state (a superset of every auth mode). */
export interface McpFormValues {
  name: string;
  url: string;
  description: string;
  authMode: McpAuthMode;
  /** Only used when `authMode` is `header`. */
  headerName: string;
  /** The secret value; only used when `authMode` is `bearer` or `header`. */
  authValue: string;
}

/** A fresh create form: no auth by default (many servers are public). */
export function emptyMcpForm(): McpFormValues {
  return {
    name: "",
    url: "",
    description: "",
    authMode: "none",
    headerName: "",
    authValue: "",
  };
}

/**
 * An edit form: the fields the connection wire actually carries (name +
 * description) prefilled, everything else blank. `url` blank means "keep the
 * stored URL"; `authMode` defaults to `keep` so an untouched auth section leaves
 * the stored type + secret in place. Picking a real auth mode with a blank
 * secret reuses the stored secret (secret blank = keep).
 */
export function editMcpForm(initial: {
  name: string;
  description: string;
}): McpFormValues {
  return {
    name: initial.name,
    url: "",
    description: initial.description,
    authMode: "keep",
    headerName: "",
    authValue: "",
  };
}

const HEADER_RE = /^[A-Za-z0-9-]{1,64}$/;
const MAX_SECRET = 4096;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 500;

/** Build the wire auth object from the form's chosen mode (never `keep`). */
export function buildMcpAuth(
  mode: McpAuthType,
  headerName: string,
): McpServerAuth {
  if (mode === "bearer") return { type: "bearer" };
  if (mode === "header") return { type: "header", header: headerName.trim() };
  return { type: "none" };
}

export type McpCreateResult =
  | { ok: true; config: McpServerConfig; authValue?: string }
  | { ok: false; field: McpFieldError };

/** Validate a CREATE: name + URL required; a secret is required for bearer/header. */
export function validateCreate(v: McpFormValues): McpCreateResult {
  const name = v.name.trim();
  if (name.length < 1 || name.length > MAX_NAME)
    return { ok: false, field: "name" };
  const url = v.url.trim();
  if (baseUrlError(url)) return { ok: false, field: "url" };
  const description = v.description.trim();
  if (description.length > MAX_DESCRIPTION)
    return { ok: false, field: "description" };
  if (v.authMode === "keep") return { ok: false, field: "authValue" };
  const auth = buildMcpAuth(v.authMode, v.headerName);
  if (auth.type === "header" && !HEADER_RE.test(auth.header))
    return { ok: false, field: "authHeader" };
  const config: McpServerConfig = { name, url, auth };
  if (description) config.description = description;
  if (v.authMode === "none") return { ok: true, config };
  if (v.authValue.length < 1 || v.authValue.length > MAX_SECRET)
    return { ok: false, field: "authValue" };
  return { ok: true, config, authValue: v.authValue };
}

export type McpPatch = Partial<McpServerConfig> & { authValue?: string };
export type McpPatchResult =
  | { ok: true; patch: McpPatch }
  | { ok: false; field: McpFieldError };

/**
 * Validate an EDIT into a PATCH: name + description always sent (they were
 * prefilled); `url` included only when the user typed one (blank = keep); auth
 * included only when the user moved off `keep`. When a real auth mode is chosen
 * with a blank secret the stored secret is kept (the gateway reseals only when
 * `authValue` is present), so omit `authValue` in that case.
 */
export function validateEdit(v: McpFormValues): McpPatchResult {
  const name = v.name.trim();
  if (name.length < 1 || name.length > MAX_NAME)
    return { ok: false, field: "name" };
  const description = v.description.trim();
  if (description.length > MAX_DESCRIPTION)
    return { ok: false, field: "description" };
  const patch: McpPatch = { name, description };
  const url = v.url.trim();
  if (url.length > 0) {
    if (baseUrlError(url)) return { ok: false, field: "url" };
    patch.url = url;
  }
  if (v.authMode !== "keep") {
    const auth = buildMcpAuth(v.authMode, v.headerName);
    if (auth.type === "header" && !HEADER_RE.test(auth.header))
      return { ok: false, field: "authHeader" };
    patch.auth = auth;
    if (v.authMode !== "none" && v.authValue.length > 0) {
      if (v.authValue.length > MAX_SECRET)
        return { ok: false, field: "authValue" };
      patch.authValue = v.authValue;
    }
  }
  return { ok: true, patch };
}
