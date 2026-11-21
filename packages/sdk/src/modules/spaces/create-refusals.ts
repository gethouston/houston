import { FREE_ORG_TAKEN } from "@houston/wire-types";
import { refusalStatus } from "../refusal-code";

export function freeOrgTakenSlug(error: unknown): string | null {
  if (!(error instanceof Error) || refusalStatus(error) !== 409) return null;
  const body = refusalBody(error);
  if (body?.code !== FREE_ORG_TAKEN) return null;
  return typeof body.freeOrgSlug === "string" && body.freeOrgSlug.length > 0
    ? body.freeOrgSlug
    : null;
}

function refusalBody(error: Error): Record<string, unknown> | null {
  const { body } = error as { body?: unknown };
  let value: unknown = body === undefined ? error.message : body;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
