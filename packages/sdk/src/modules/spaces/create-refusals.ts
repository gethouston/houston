import { FREE_ORG_TAKEN } from "@houston/wire-types";
import { refusalStatus } from "../refusal-code";

/**
 * The org that already holds the caller's free slot, when a free create was
 * refused for it (`409 {code: "free_org_taken", freeOrgSlug}`), or null for
 * every other error. An expected state the create flow answers with an offer,
 * never a bug to report. The code is recognized only with its 409 and a slug,
 * so an unrelated error carrying the same word stays a bug.
 */
export function freeOrgTakenSlug(error: unknown): string | null {
  if (!(error instanceof Error) || refusalStatus(error) !== 409) return null;
  const body = refusalBody(error);
  if (body?.code !== FREE_ORG_TAKEN) return null;
  return typeof body.freeOrgSlug === "string" && body.freeOrgSlug.length > 0
    ? body.freeOrgSlug
    : null;
}

/** The refusal's JSON body: parsed on the adapter's error, text on the SDK's. */
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
