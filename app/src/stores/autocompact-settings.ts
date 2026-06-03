import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Autocompact on/off — a client-side UI behavior preference, persisted to
 * localStorage. Kept out of the engine `preferences` table on purpose: it
 * governs how the desktop client drives sessions, reads synchronously at send
 * time (see `lib/autocompact.ts`), and doesn't need cross-device sync.
 *
 * When enabled (default), once a conversation's context fill reaches the
 * threshold the next turn runs on a freshly-compacted session. The threshold
 * is a build-time tuning constant (`VITE_AUTOCOMPACT_THRESHOLD`, default 93),
 * not a user setting — see `lib/context-usage.ts`.
 */
interface AutocompactSettings {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useAutocompactSettings = create<AutocompactSettings>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled: (enabled) => set({ enabled }),
    }),
    { name: "houston.autocompact" },
  ),
);
