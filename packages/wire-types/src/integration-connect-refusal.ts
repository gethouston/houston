export type IntegrationConnectRefusalCode =
  | "toolkit_oauth_unavailable"
  | "toolkit_no_auth"
  | "toolkit_not_found";

export const TOOLKIT_OAUTH_UNAVAILABLE = "toolkit_oauth_unavailable";
export const TOOLKIT_NO_AUTH = "toolkit_no_auth";
export const TOOLKIT_NOT_FOUND = "toolkit_not_found";

const CODES: readonly string[] = [
  TOOLKIT_OAUTH_UNAVAILABLE,
  TOOLKIT_NO_AUTH,
  TOOLKIT_NOT_FOUND,
] satisfies readonly IntegrationConnectRefusalCode[];

export interface IntegrationConnectRefusal {
  code: IntegrationConnectRefusalCode;
  error: string;
}

export function isIntegrationConnectRefusalCode(
  code: unknown,
): code is IntegrationConnectRefusalCode {
  return typeof code === "string" && CODES.includes(code);
}

export function parseIntegrationConnectRefusal(
  body: unknown,
): IntegrationConnectRefusal | null {
  if (typeof body !== "object" || body === null) return null;
  const { code, error } = body as Record<string, unknown>;
  if (!isIntegrationConnectRefusalCode(code) || typeof error !== "string")
    return null;
  return { code, error };
}
