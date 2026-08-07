import type {
  AddCustomIntegrationInput,
  CustomDetectResult,
} from "@houston-ai/engine-client";

/** The manual add form's state (HOU-980). `url` doubles as the OpenAPI
 *  document URL and the MCP endpoint, whichever `kind` says. */
export interface CustomAddForm {
  kind: "openapi" | "mcp";
  url: string;
  name: string;
  needsKey: boolean;
}

export const EMPTY_CUSTOM_ADD_FORM: CustomAddForm = {
  kind: "openapi",
  url: "",
  name: "",
  needsKey: false,
};

/** Only http(s) URLs make sense for a remote spec / MCP endpoint. */
export function isServiceUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim());
}

/**
 * Fold a detect result into the form: adopt the detected kind, fill a name
 * the user has not typed yet, and flip "needs a key" on when the probe hit an
 * auth wall — but NOT an OAuth wall: that server wants its own sign-in flow,
 * which a pasted key can never satisfy (the verdict line says so instead).
 * Never overwrites what the user already wrote, and an `unknown` result
 * changes nothing (the caller shows the "couldn't recognize it" line).
 */
export function applyDetect(
  form: CustomAddForm,
  result: CustomDetectResult,
): CustomAddForm {
  if (result.kind === "unknown") return form;
  return {
    ...form,
    kind: result.kind,
    name: form.name.trim() ? form.name : (result.name ?? form.name),
    needsKey:
      result.requiresAuthentication && !result.requiresOAuth
        ? true
        : form.needsKey,
  };
}

/** The i18n key for the one-line detect verdict under the URL field. An
 *  OAuth-walled MCP server splits on the host-reported `oauthSupported`
 *  (PRODUCT-1172): supported reads as good news (you'll sign in after
 *  adding), unsupported keeps the honest refusal. */
export function detectSummaryKey(
  result: CustomDetectResult,
):
  | "custom.add.detected.api"
  | "custom.add.detected.mcp"
  | "custom.add.detected.mcpOauth"
  | "custom.add.detected.mcpOauthOk"
  | "custom.add.detected.unknown" {
  if (result.kind === "openapi") return "custom.add.detected.api";
  if (result.kind === "mcp")
    return result.requiresOAuth
      ? result.oauthSupported
        ? "custom.add.detected.mcpOauthOk"
        : "custom.add.detected.mcpOauth"
      : "custom.add.detected.mcp";
  return "custom.add.detected.unknown";
}

/** An MCP verdict that says the server only signs in with its own account
 *  flow BLOCKS submission ONLY where this deployment cannot run that sign-in
 *  (the host says so via `oauthSupported`, PRODUCT-1172): there a pasted key
 *  can never satisfy OAuth and adding would land a permanently broken
 *  "0 actions" integration. Where sign-in IS supported the add proceeds with
 *  auth `oauth` and chains into the browser. The verdict line above the
 *  button explains either way (always visible, never hover-gated). */
export function oauthBlocked(
  form: CustomAddForm,
  result: CustomDetectResult | null,
): boolean {
  return (
    form.kind === "mcp" &&
    result?.requiresOAuth === true &&
    result.oauthSupported !== true
  );
}

/** The wire input for a complete form, or `null` while a required field is
 *  missing/invalid (the Add button stays disabled — nothing to submit yet).
 *  `detect` (the shown verdict) upgrades a supported OAuth-walled MCP add to
 *  auth `oauth`. */
export function addInputFrom(
  form: CustomAddForm,
  detect?: CustomDetectResult | null,
): AddCustomIntegrationInput | null {
  const name = form.name.trim();
  const url = form.url.trim();
  if (!name || !isServiceUrl(url)) return null;
  if (
    form.kind === "mcp" &&
    detect?.requiresOAuth === true &&
    detect.oauthSupported === true
  ) {
    return { kind: "mcp", name, endpoint: url, auth: "oauth" };
  }
  const auth = form.needsKey ? ("credential" as const) : ("none" as const);
  return form.kind === "openapi"
    ? { kind: "openapi", name, url, auth }
    : { kind: "mcp", name, endpoint: url, auth };
}
