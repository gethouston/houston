import { getPreference, type TextStore } from "@houston/domain";
import type { WorkspaceStore } from "../ports";

export const NEXT_STEP_SUGGESTIONS_PREFERENCE = "next_step_suggestions";

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
      console.warn(
        "[next-step-suggestions] preference unreadable; this turn keeps them on",
        error,
      );
      return true;
    }
  };
}

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
  const { nextStepSuggestions: sent, ...fields } = parsed as Record<
    string,
    unknown
  >;
  if (await read())
    return sent === undefined ? body : Buffer.from(JSON.stringify(fields));
  return Buffer.from(JSON.stringify({ ...fields, nextStepSuggestions: false }));
}
