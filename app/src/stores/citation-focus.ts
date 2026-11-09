import { create } from "zustand";

/**
 * Which file comment the person is pointing at, shared between its composer
 * chip and its mark on the page: hovering either lights the other, and
 * pressing a chip asks the open preview to bring the mark into view.
 */
interface CitationFocusState {
  hotId: string | null;
  /** A pending "show this mark" ask; `nonce` makes a repeat press count. */
  reveal: { id: string; nonce: number } | null;
  setHot: (id: string | null) => void;
  requestReveal: (id: string) => void;
}

export const useCitationFocus = create<CitationFocusState>((set) => ({
  hotId: null,
  reveal: null,
  setHot: (hotId) => set({ hotId }),
  requestReveal: (id) =>
    set((s) => ({ reveal: { id, nonce: (s.reveal?.nonce ?? 0) + 1 } })),
}));
