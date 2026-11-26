/**
 * The typed reasons the host and the gateway refuse to mint a connect link
 * (`POST /v1/integrations/:provider/connect`, `400` with a `code` beside the
 * `error` text). Expected business states, not crashes:
 *
 *  - `toolkit_oauth_unavailable`: the toolkit only offers OAuth and no OAuth
 *    app is registered for it yet, a Houston-side setup gap the person can do
 *    nothing about.
 *  - `toolkit_no_auth`: the toolkit needs no account at all; its tools already
 *    work.
 *  - `toolkit_not_found`: Composio carries no app by this slug.
 *
 * Erasable-syntax-only and dependency-free, so the app's node:test entry
 * points load it through the `@houston/wire-types/integration-connect-refusal`
 * subpath.
 */
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

/** Whether a body's `code` is one of the connect refusals. */
export function isIntegrationConnectRefusalCode(
  code: unknown,
): code is IntegrationConnectRefusalCode {
  return typeof code === "string" && CODES.includes(code);
}

/** Parse only a typed connect refusal body; anything else is null. */
export function parseIntegrationConnectRefusal(
  body: unknown,
): IntegrationConnectRefusal | null {
  if (typeof body !== "object" || body === null) return null;
  const { code, error } = body as Record<string, unknown>;
  if (!isIntegrationConnectRefusalCode(code) || typeof error !== "string")
    return null;
  return { code, error };
}
