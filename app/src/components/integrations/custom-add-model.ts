import type {
  AddCustomIntegrationInput,
  CustomDetectResult,
} from "@houston/engine-adapter";

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

export function isServiceUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url.trim());
}

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
