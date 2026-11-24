import { EngineError } from "@houston/runtime-client";

/**
 * How an import's rejection is read.
 *
 * When a document unloads, the browser aborts its in-flight requests and the
 * rejection looks exactly like a transport drop (a `TypeError`, no response).
 * The onboarding closing used to read that as a failed import and finish
 * onboarding from the dying page, so a reload during the save landed in the
 * app with an empty manager chat. `aborted` names the host
 * never answering WHILE THE PAGE WAS LEAVING; an {@link EngineError} is an
 * answer, so it stays a failure whatever the page is doing, and so does any
 * rejection on a page that is not leaving. What happens to an aborted import
 * is conversation-import-hold.ts: held, and sent again if the page lives on.
 */
export type ImportFailureKind = "aborted" | "failed";

export function classifyImportFailure(
  err: unknown,
  unloading: boolean,
): ImportFailureKind {
  if (err instanceof EngineError) return "failed";
  return unloading ? "aborted" : "failed";
}
