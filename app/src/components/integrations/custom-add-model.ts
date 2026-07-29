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
 * auth wall. Never overwrites what the user already wrote, and an `unknown`
 * result changes nothing (the caller shows the "couldn't recognize it" line).
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
    needsKey: result.requiresAuthentication ? true : form.needsKey,
  };
}

/** The i18n key for the one-line detect verdict under the URL field. */
export function detectSummaryKey(
  result: CustomDetectResult,
):
  | "custom.add.detected.api"
  | "custom.add.detected.mcp"
  | "custom.add.detected.unknown" {
  if (result.kind === "openapi") return "custom.add.detected.api";
  if (result.kind === "mcp") return "custom.add.detected.mcp";
  return "custom.add.detected.unknown";
}

/** The wire input for a complete form, or `null` while a required field is
 *  missing/invalid (the Add button stays disabled — nothing to submit yet). */
export function addInputFrom(
  form: CustomAddForm,
): AddCustomIntegrationInput | null {
  const name = form.name.trim();
  const url = form.url.trim();
  if (!name || !isServiceUrl(url)) return null;
  const auth = form.needsKey ? ("credential" as const) : ("none" as const);
  return form.kind === "openapi"
    ? { kind: "openapi", name, url, auth }
    : { kind: "mcp", name, endpoint: url, auth };
}
