import { create } from "zustand";

export interface LinkedInPostSlot {
  posting: boolean;
  landed: string | null;
  unconfirmed: boolean;
}

export const IDLE_LINKEDIN_POST: LinkedInPostSlot = {
  posting: false,
  landed: null,
  unconfirmed: false,
};

export function linkedInPostKey(uid: string | null, space: string): string {
  return JSON.stringify([uid, space]);
}

export interface LinkedInPostClaim {
  key: string;
  uid: string | null;
}

export function isPostHeld(slot: LinkedInPostSlot): boolean {
  return slot.unconfirmed;
}

interface LinkedInPostStore {
  slots: Record<string, LinkedInPostSlot>;
  start: (uid: string | null, space: string) => LinkedInPostClaim | null;
  holds: (claim: LinkedInPostClaim, uid: string | null) => boolean;
  posted: (claim: LinkedInPostClaim, postUrl: string) => void;
  unconfirmed: (claim: LinkedInPostClaim) => void;
  ended: (claim: LinkedInPostClaim) => void;
  shown: (key: string) => void;
  dismissUnconfirmed: (key: string) => void;
  reset: () => void;
}

export const useLinkedInPosts = create<LinkedInPostStore>((set, get) => {
  const patch = (key: string, next: Partial<LinkedInPostSlot>) =>
    set((s) => ({
      slots: {
        ...s.slots,
        [key]: { ...(s.slots[key] ?? IDLE_LINKEDIN_POST), ...next },
      },
    }));
  return {
    slots: {},
    start: (uid, space) => {
      const key = linkedInPostKey(uid, space);
      const slot = get().slots[key];
      if (slot?.posting || slot?.unconfirmed) return null;
      patch(key, { posting: true, landed: null });
      return { key, uid };
    },
    holds: (claim, uid) => claim.uid === uid,
    posted: (claim, postUrl) =>
      patch(claim.key, { posting: false, landed: postUrl }),
    unconfirmed: (claim) =>
      patch(claim.key, { posting: false, unconfirmed: true }),
    ended: (claim) => patch(claim.key, { posting: false }),
    shown: (key) => patch(key, { landed: null }),
    dismissUnconfirmed: (key) => patch(key, { unconfirmed: false }),
    reset: () =>
      set((s) => ({
        slots: Object.fromEntries(
          Object.entries(s.slots)
            .filter(([, slot]) => slot.posting || slot.unconfirmed)
            .map(([key, slot]) => [key, { ...slot, landed: null }]),
        ),
      })),
  };
});

export function useLinkedInPostSlot(key: string): LinkedInPostSlot {
  return useLinkedInPosts((s) => s.slots[key] ?? IDLE_LINKEDIN_POST);
}
