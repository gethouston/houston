import { create } from "zustand";

export interface ManagerHandoff {
  text: string;
  context: string;
  grants: ["createAgent"];
}

interface ManagerHandoffState {
  pending: ManagerHandoff | null;
  handOff: (handoff: ManagerHandoff) => void;
  take: () => ManagerHandoff | null;
}

export const useManagerHandoffStore = create<ManagerHandoffState>(
  (set, get) => ({
    pending: null,
    handOff: (handoff) => set({ pending: handoff }),
    take: () => {
      const { pending } = get();
      if (pending !== null) set({ pending: null });
      return pending;
    },
  }),
);
