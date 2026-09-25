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
import { type AcademyRecord, completeLessonRecord } from "./academy-record.ts";
import {
  type AcademyDevice,
  type AcademyStorePorts,
  academyPortsFor,
} from "./academy-store.ts";
import { recordLessonPosition } from "./lesson-position.ts";
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
 * Awards a lesson the user just finished. Idempotent: re-reading a lesson is
 * welcome, but it pays once.
 *
 * Answers with the record the award was applied TO as well as the one it
 * produced, so a caller can tell what this very write changed (a chapter it
 * finished) without re-reading anything.
 */
export async function completeLessonLive(
  uid: string | null,
  lessonId: string,
  experience: number,
): Promise<{ before: AcademyRecord | null; after: AcademyRecord }> {
  const now = new Date();
  let before: AcademyRecord | null = null;
  const after = await academyQueueFor(uid).run((record) => {
    before = record;
    return completeLessonRecord(record, lessonId, experience, now);
  });
  return { before, after };
}

/**
 * Notes the beat a running lesson reached, so leaving it keeps the place.
 * A finished lesson is left alone (`recordLessonPosition`), so a replay never
 * turns it back into one to continue.
 */
export async function saveLessonPositionLive(
  uid: string | null,
  lessonId: string,
  index: number,
): Promise<AcademyRecord | null> {
  const now = new Date();
  return academyQueueFor(uid).run((record) =>
    recordLessonPosition(record, lessonId, index, now),
  );
}
