// The live wiring of the Academy's stores: the engine preference store, the
// browser's localStorage mirror, the install that earns the points, and the
// per-account mutation queue every award path goes through. Kept apart from
// `./academy-store.ts` and `./academy-mutations.ts` so the durability rules
// stay importable (and testable) without the Tauri/engine surface.

import { SESSION_QUERY_KEY, type Session } from "../identity";
import { queryClient } from "../query-client";
import { tauriPreferences } from "../tauri";
import {
  type AcademyMutationQueue,
  createAcademyQueues,
} from "./academy-mutations.ts";
import { SETUP_CHAPTER_EXPERIENCE, SETUP_CHAPTER_ID } from "./academy-ranks.ts";
import {
  type AcademyRecord,
  completeChapterRecord,
  completeLessonRecord,
} from "./academy-record.ts";
import {
  type AcademyDevice,
  type AcademyStorePorts,
  academyPortsFor,
} from "./academy-store.ts";
import { type UsageDeviceStore, usageDeviceId } from "./usage-device.ts";

const academyDevice: AcademyDevice = {
  getPreference: (key) => tauriPreferences.get(key),
  setPreference: (key, value) => tauriPreferences.set(key, value),
  readLocal: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null; /* disabled storage — the engine pref still carries it */
    }
  },
  writeLocal: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota / disabled storage — the engine pref still carries the award */
    }
  },
};

/**
 * Whose progress the engine is serving RIGHT NOW. Read from the session query
 * cache rather than captured anywhere, because an award can outlive the
 * sign-in that started it: a burst of points buffered for one user must never
 * be written into the next user's preference. `useSession` is the single
 * writer of this cache entry (it mirrors the Keychain on desktop and the
 * firebase-js-sdk on web), so this is the same value React sees.
 *
 * Signed out is a legitimate answer, not a missing one: a self-host or
 * identity-off install earns progress too, under the `anon` record.
 */
export function activeAccountUid(): string | null {
  return (
    queryClient.getQueryData<Session | null>(SESSION_QUERY_KEY)?.uid ?? null
  );
}

export function liveAcademyPorts(uid: string | null): AcademyStorePorts {
  return academyPortsFor(academyDevice, uid, activeAccountUid);
}

/** Plain localStorage, unguarded on purpose: `usageDeviceId` needs to SEE a
 *  storage that refuses, so it can fall back instead of minting a new key on
 *  every launch. Not uid-keyed — the machine is the machine whoever signs in. */
const usageDeviceStore: UsageDeviceStore = {
  read: (key) => localStorage.getItem(key),
  write: (key, value) => localStorage.setItem(key, value),
};

const queues = createAcademyQueues(liveAcademyPorts, () =>
  usageDeviceId(usageDeviceStore, () => crypto.randomUUID()),
);

/** The one queue every award for `uid` passes through — see
 *  `./academy-mutations.ts`. */
export function academyQueueFor(uid: string | null): AcademyMutationQueue {
  return queues(uid);
}

/**
 * Awards the setup chapter, called imperatively by the onboarding finish path so
 * nobody arrives at the Academy with an empty record. Idempotent: onboarding may
 * finish more than once (a resumed flow, a second window) and this pays once.
 */
export async function completeSetupChapterLive(
  uid: string | null,
): Promise<AcademyRecord> {
  const now = new Date();
  return academyQueueFor(uid).run((record) =>
    completeChapterRecord(
      record,
      SETUP_CHAPTER_ID,
      SETUP_CHAPTER_EXPERIENCE,
      now,
    ),
  );
}

/**
 * Awards a lesson the user just finished. Idempotent for the same reason a
 * chapter is: re-reading a lesson is welcome, but it pays once.
 */
export async function completeLessonLive(
  uid: string | null,
  lessonId: string,
  experience: number,
): Promise<AcademyRecord> {
  const now = new Date();
  return academyQueueFor(uid).run((record) =>
    completeLessonRecord(record, lessonId, experience, now),
  );
}
