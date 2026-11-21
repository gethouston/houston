import { create } from "zustand";

interface CitationFocusState {
  hotId: string | null;
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
