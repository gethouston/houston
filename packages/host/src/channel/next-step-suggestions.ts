import { getPreference, type TextStore } from "@houston/domain";
import type { WorkspaceStore } from "../ports";

/**
 * The person's "Next-step suggestions" setting, applied by the HOST to every
 * turn it hands a runtime: a chat send, a mission's first turn, a routine fire,
 * the morning briefing. A client stamping it would reach only the sends that
 * client makes, and a turn this host starts on its own has no client at all.
 *
 * Read per turn, so a change lands on the next one. Only an unfronted host
 * (desktop, self-host) wires it: there the preferences doc this host serves is
 * the person's own. Behind a gateway the gateway owns preferences and stamps
 * the field itself, which is why a body that already names it is left alone.
 */
export const NEXT_STEP_SUGGESTIONS_PREFERENCE = "next_step_suggestions";

/** Resolves whether the next turn carries suggestions. Never rejects. */
export type NextStepSuggestionsReader = () => Promise<boolean>;

export function nextStepSuggestionsReader(
  vfs: TextStore,
  store: Pick<WorkspaceStore, "getOrCreatePersonalWorkspace">,
  userId: string,
): NextStepSuggestionsReader {
  return async () => {
    try {
      const ws = await store.getOrCreatePersonalWorkspace(userId);
      const value = await getPreference(
        vfs,
        ws.id,
        NEXT_STEP_SUGGESTIONS_PREFERENCE,
      );
      return value !== "false";
    } catch (error) {
      // Suggestions on is the default the person gets anyway, so the turn
      // runs; a warning (not an error) keeps it out of the Sentry issue list.
      console.warn(
        "[next-step-suggestions] preference unreadable; this turn keeps them on",
        error,
      );
      return true;
    }
  };
}

/**
 * A turn body as the runtime should receive it. Only OFF is stamped: omission
 * means on, so a default turn's bytes stay what the sender sent. A body this
 * cannot parse travels untouched, for the runtime to refuse.
 */
export async function stampNextStepSuggestions(
  body: Buffer,
  read: NextStepSuggestionsReader,
): Promise<Buffer> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8") || "{}");
  } catch {
    return body;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return body;
  const fields = parsed as Record<string, unknown>;
  if (typeof fields.nextStepSuggestions === "boolean") return body;
  if (await read()) return body;
  return Buffer.from(JSON.stringify({ ...fields, nextStepSuggestions: false }));
}
