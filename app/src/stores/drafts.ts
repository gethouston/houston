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
