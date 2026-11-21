import {
  type IntegrationConnectRefusalCode,
  isIntegrationConnectRefusalCode,
} from "@houston/wire-types/integration-connect-refusal";
import { refusalCode } from "../refusal-code";

const LEGACY_OAUTH_DETAIL = "only offers OAuth";

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
