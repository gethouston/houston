import {
  type IntegrationConnectRefusalCode,
  isIntegrationConnectRefusalCode,
} from "@houston/wire-types/integration-connect-refusal";
import { refusalCode } from "../refusal-code";

const LEGACY_OAUTH_DETAIL = "only offers OAuth";

/**
 * The typed refusal behind a failed connect (`toolkit_oauth_unavailable`,
 * `toolkit_no_auth`, `toolkit_not_found`), or null for every other error.
 * Reads the adapter's `HoustonEngineError` (parsed `body`), the local
 * runtime-client's `EngineError` (raw text `body`) and the SDK's own errors
 * (response text as the message), so every surface and the AI Manager judge a
 * refused connect the same way. Each refusal is an expected state with its
 * own copy, never a bug report.
 *
 * Dependency-free beyond the wire subpath and erasable-syntax-only: the app's
 * node:test entry points load it through the
 * `@houston/sdk/integrations/connect-refusal` subpath.
 */
export function integrationConnectRefusal(
  error: unknown,
): IntegrationConnectRefusalCode | null {
  if (!(error instanceof Error)) return null;
  const code = refusalCode(error);
  if (isIntegrationConnectRefusalCode(code)) return code;
  return legacyDetail(error).includes(LEGACY_OAUTH_DETAIL)
    ? "toolkit_oauth_unavailable"
    : null;
}

function legacyDetail(error: Error): string {
  let body = (error as { body?: unknown }).body ?? error.message;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return "";
    }
  }
  if (typeof body !== "object" || body === null) return "";
  const { detail } = body as { detail?: unknown };
  return typeof detail === "string" ? detail : "";
}
