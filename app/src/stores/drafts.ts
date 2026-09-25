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
  /** Drop every draft — the outgoing account's parked messages are private to it
   *  (identity change, HOU-903). */
  reset: () => void;
  /** The one open composer showing seeded words ({@link seedDraft}). */
  seed: DraftSeed | null;
}

/** A new-conversation slot (`over`) showing the draft at `key` instead. */
export interface DraftSeed {
  over: string;
  key: string;
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
/** Counts seeds in this session, so each run's slot key is unique. */
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

/**
 * The draft key the new-conversation composer at `key` reads and writes: its
 * own, unless a seed stands over it.
 */
export function seededDraftKey(seed: DraftSeed | null, key: string): string {
  return seed?.over === key ? seed.key : key;
}

/** {@link seededDraftKey} for the composer of a draft `scope`, live. */
export function useNewConversationDraftKey(scope?: string | null): string {
  const key = newConversationDraftKey(scope);
  return useDraftStore((s) => seededDraftKey(s.seed, key));
}

/**
 * Open the new-conversation composer at `over` with `text` typed in, without
 * touching what the user parked there: the words live in a slot of their own,
 * which the composer shows in place of its own until the seed ends. A send
 * empties the slot it was pressed in, so a send still in flight when the seed
 * ends empties the seed's slot, never the user's.
 *
 * Each seed gets a slot of its own run, so an earlier run's send that lands
 * late empties that run's slot and never a newer run's words.
 *
 * Returns the end of this seed (once; a newer seed or a hand-opened composer
 * that already ended it is left alone).
 */
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

/**
 * True while a seed stands: a New task opened by hand (shortcut, palette,
 * button) would swap the seeded words for the user's own draft mid-lesson, so
 * it waits until the seed ends.
 */
export function newTaskHeldBySeed(): boolean {
  return useDraftStore.getState().seed !== null;
}

/** End the seed, if any: its composer shows its own draft again. */
export function endDraftSeed(): void {
  useDraftStore.setState((s) => {
    if (s.seed === null) return s;
    const drafts = { ...s.drafts };
    delete drafts[s.seed.key];
    return { seed: null, drafts };
  });
}
