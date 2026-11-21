import { create } from "zustand";
import type { OrgTabId } from "./org-view-model.ts";

interface OrgNavState {
  requestedTab: OrgTabId | null;
  requestTab: (tab: OrgTabId) => void;
  clearRequestedTab: () => void;
  focusedPerson: string | null;
  requestPerson: (userId: string) => void;
  clearFocusedPerson: () => void;
}

export const useOrgNav = create<OrgNavState>((set) => ({
  requestedTab: null,
  requestTab: (tab) => set({ requestedTab: tab }),
  clearRequestedTab: () => set({ requestedTab: null }),
  focusedPerson: null,
  requestPerson: (userId) =>
    set({ requestedTab: "people", focusedPerson: userId }),
  clearFocusedPerson: () => set({ focusedPerson: null }),
}));
