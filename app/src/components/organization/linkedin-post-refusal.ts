import type { LinkedInRefusalAction } from "@houston/sdk/linkedin/policy";
import type { ShareLine } from "./org-chart-share-run";

/** A post the gateway refused for what this client sent: a bug to report. */
export class LinkedInPostRefusedError extends Error {
  override name = "LinkedInPostRefusedError";
}

/** The line a refusal leaves under the button; `null` says nothing. */
export function refusalLine(
  action: LinkedInRefusalAction,
  retryAfterMs: number | undefined,
): ShareLine | null {
  if (action === "reconnect") return { kind: "reconnect" };
  if (action === "retry") return { kind: "retry" };
  if (action !== "wait") return null;
  return retryAfterMs === undefined
    ? { kind: "wait" }
    : { kind: "wait", retryAfterMs };
}
