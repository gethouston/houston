import { useCallback, useMemo } from "react";
import { useDraftStore } from "../../stores/drafts";

/**
 * Composer draft persistence for the board, shared by both views. Exposes the
 * text-only draft map AIBoard expects and a setter that writes back to the
 * draft store, so what the user typed survives navigation between missions.
 */
export function useBoardDrafts() {
  const rawDrafts = useDraftStore((s) => s.drafts);
  const drafts = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawDrafts)) if (value.text) out[key] = value.text;
    return out;
  }, [rawDrafts]);
  const onDraftChange = useCallback((sessionKey: string, text: string) => {
    useDraftStore.getState().setDraftText(sessionKey, text);
  }, []);
  return { drafts, onDraftChange };
}
