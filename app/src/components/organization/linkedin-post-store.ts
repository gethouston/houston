import { create } from "zustand";

/**
 * A LinkedIn post outlives the org chart page that started it: the gateway
 * finishes it even after the person navigates away. Whether one is out, and
 * how one settled, therefore live here, never in the page: coming back while
 * a post is out still shows Posting (never a second Post button), a post
 * that went up while the page was gone is said in the next opening, and a
 * post that may be up holds Post in every opening until the person says they
 * checked LinkedIn ({@link LinkedInPostStore.dismissUnconfirmed}).
 *
 * A slot belongs to the signed-in person in one space
 * ({@link linkedInPostKey}): every account's personal space has the same id.
 * A post's {@link LinkedInPostClaim} names its person, and its result always
 * lands in that person's slot, signed in or not (`linkedin-post-run.ts`).
 */
export interface LinkedInPostSlot {
  posting: boolean;
  /** A post that went up and no open dialog has shown yet. */
  landed: string | null;
  /** A post that may be up: Post waits until the person checked LinkedIn. */
  unconfirmed: boolean;
}

export const IDLE_LINKEDIN_POST: LinkedInPostSlot = {
  posting: false,
  landed: null,
  unconfirmed: false,
};

/** The slot of `uid` (`null`: signed out, a local desktop) in `space`. */
export function linkedInPostKey(uid: string | null, space: string): string {
  return JSON.stringify([uid, space]);
}

/** One post's hold on its slot, made by `uid`. */
export interface LinkedInPostClaim {
  key: string;
  uid: string | null;
}

/** Whether Post waits: a post that may be up is never retried blind. */
export function isPostHeld(slot: LinkedInPostSlot): boolean {
  return slot.unconfirmed;
}

interface LinkedInPostStore {
  slots: Record<string, LinkedInPostSlot>;
  /** Claims the slot; `null` while a post from it is out or held. */
  start: (uid: string | null, space: string) => LinkedInPostClaim | null;
  /** Whether `claim` was made by `uid`, the person signed in now. */
  holds: (claim: LinkedInPostClaim, uid: string | null) => boolean;
  /** The post went up: held until an open dialog shows it. */
  posted: (claim: LinkedInPostClaim, postUrl: string) => void;
  /** It may be up: held until the person checked LinkedIn. */
  unconfirmed: (claim: LinkedInPostClaim) => void;
  /** The post is over, whatever came of it. */
  ended: (claim: LinkedInPostClaim) => void;
  /** An open dialog showed the post that went up. */
  shown: (key: string) => void;
  /** The person checked LinkedIn: Post comes back. */
  dismissUnconfirmed: (key: string) => void;
  /**
   * The signed-in identity changed: every slot goes but the ones with a post
   * still out or one that may be up. Those keep Posting or the hold (only
   * their unshown link goes), so the same person signing back in is never
   * offered a second Post; nobody else's key ever reads them.
   */
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

/** The post slot at `key` ({@link linkedInPostKey}). */
export function useLinkedInPostSlot(key: string): LinkedInPostSlot {
  return useLinkedInPosts((s) => s.slots[key] ?? IDLE_LINKEDIN_POST);
}
