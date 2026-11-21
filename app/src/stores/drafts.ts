import { create } from "zustand";

interface DraftEntry {
  text: string;
  files: File[];
}

interface DraftsState {
  drafts: Record<string, DraftEntry>;
  setDraftText: (key: string, text: string) => void;
  setDraftFiles: (key: string, files: File[]) => void;
  clearDraft: (key: string) => void;
  clearByPrefix: (prefix: string) => void;
  reset: () => void;
  seed: DraftSeed | null;
}

export interface DraftSeed {
  over: string;
  key: string;
}

export const NEW_CONVERSATION_KEY = "new-conversation";

export function newConversationDraftKey(scope?: string | null): string {
  return scope ? `${NEW_CONVERSATION_KEY}:${scope}` : NEW_CONVERSATION_KEY;
}

export function boardDraftKey(key: string, scopedKey: string): string {
  return key === NEW_CONVERSATION_KEY ? scopedKey : key;
}

const EMPTY_DRAFT: DraftEntry = { text: "", files: [] };
let seedRun = 0;
const EMPTY_FILES: File[] = [];

export const useDraftStore = create<DraftsState>((set) => ({
  drafts: {},
  seed: null,

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

  reset: () => set({ drafts: {}, seed: null }),
}));

export function useDraftText(key: string | null): string {
  return useDraftStore((s) => (key ? (s.drafts[key]?.text ?? "") : ""));
}

export function useDraftFiles(key: string | null): File[] {
  return useDraftStore((s) =>
    key ? (s.drafts[key]?.files ?? EMPTY_FILES) : EMPTY_FILES,
  );
}

export function seededDraftKey(seed: DraftSeed | null, key: string): string {
  return seed?.over === key ? seed.key : key;
}

export function useNewConversationDraftKey(scope?: string | null): string {
  const key = newConversationDraftKey(scope);
  return useDraftStore((s) => seededDraftKey(s.seed, key));
}

export function seedDraft(over: string, text: string): () => void {
  seedRun += 1;
  const seed: DraftSeed = { over, key: `${over}:seed:${seedRun}` };
  useDraftStore.setState((s) => ({
    seed,
    drafts: { ...s.drafts, [seed.key]: { text, files: [] } },
  }));
  return () => {
    if (useDraftStore.getState().seed === seed) endDraftSeed();
  };
}

export function newTaskHeldBySeed(): boolean {
  return useDraftStore.getState().seed !== null;
}

export function endDraftSeed(): void {
  useDraftStore.setState((s) => {
    if (s.seed === null) return s;
    const drafts = { ...s.drafts };
    delete drafts[s.seed.key];
    return { seed: null, drafts };
  });
}
