import { create } from "zustand";

interface DraftEntry {
  text: string;
  files: File[];
}

interface DraftsState {
  /** Drafts keyed by session key (e.g. "chat-agentId", "activity-123", "new-conversation") */
  drafts: Record<string, DraftEntry>;
  setDraftText: (key: string, text: string) => void;
  setDraftFiles: (key: string, files: File[]) => void;
  clearDraft: (key: string) => void;
  /** Remove all drafts whose key starts with the given prefix (e.g. on agent delete). */
  clearByPrefix: (prefix: string) => void;
}

/**
 * AIBoard's key for the not-yet-created conversation composer. The board
 * contract keeps the plain literal; the app stores it scoped (below) so one
 * agent's parked first message never surfaces in another agent's composer.
 */
export const NEW_CONVERSATION_KEY = "new-conversation";

/**
 * Store key for a new-conversation draft, scoped per agent (HOU-730). A
 * missing scope (Mission Control's cross-agent composer) keeps the plain key.
 */
export function newConversationDraftKey(scope?: string | null): string {
  return scope ? `${NEW_CONVERSATION_KEY}:${scope}` : NEW_CONVERSATION_KEY;
}

/** The text-only view AIBoard consumes: the view's scoped new-conversation
 *  draft surfaces under the plain key; every other view's stays hidden. */
export function boardDraftsView(
  rawDrafts: Record<string, { text: string }>,
  scopedKey: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawDrafts)) {
    if (!value.text) continue;
    if (key === scopedKey) out[NEW_CONVERSATION_KEY] = value.text;
    // Another surface's new-conversation draft: never expose it here.
    else if (!key.startsWith(NEW_CONVERSATION_KEY)) out[key] = value.text;
  }
  return out;
}

const EMPTY_DRAFT: DraftEntry = { text: "", files: [] };
const EMPTY_FILES: File[] = [];

export const useDraftStore = create<DraftsState>((set) => ({
  drafts: {},

  setDraftText: (key, text) =>
    set((s) => ({
      drafts: {
        ...s.drafts,
        [key]: { ...(s.drafts[key] ?? EMPTY_DRAFT), text },
      },
    })),

  setDraftFiles: (key, files) =>
    set((s) => ({
      drafts: {
        ...s.drafts,
        [key]: { ...(s.drafts[key] ?? EMPTY_DRAFT), files },
      },
    })),

  clearDraft: (key) =>
    set((s) => {
      const next = { ...s.drafts };
      delete next[key];
      return { drafts: next };
    }),

  clearByPrefix: (prefix) =>
    set((s) => {
      const next: Record<string, DraftEntry> = {};
      for (const [k, v] of Object.entries(s.drafts)) {
        if (!k.startsWith(prefix)) next[k] = v;
      }
      return { drafts: next };
    }),
}));

/** Read-only selector for a single draft's text. Returns "" if no draft exists. */
export function useDraftText(key: string | null): string {
  return useDraftStore((s) => (key ? (s.drafts[key]?.text ?? "") : ""));
}

/** Read-only selector for a single draft's files. Returns [] if no draft exists. */
export function useDraftFiles(key: string | null): File[] {
  return useDraftStore((s) =>
    key ? (s.drafts[key]?.files ?? EMPTY_FILES) : EMPTY_FILES,
  );
}
