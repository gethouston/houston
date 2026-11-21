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
      return null;
    }
  },
  writeLocal: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};

export function activeAccountUid(): string | null {
  return (
    queryClient.getQueryData<Session | null>(SESSION_QUERY_KEY)?.uid ?? null
  );
}

export function liveAcademyPorts(uid: string | null): AcademyStorePorts {
  return academyPortsFor(academyDevice, uid, activeAccountUid);
}

const usageDeviceStore: UsageDeviceStore = {
  read: (key) => localStorage.getItem(key),
  write: (key, value) => localStorage.setItem(key, value),
};

const queues = createAcademyQueues(liveAcademyPorts, () =>
  usageDeviceId(usageDeviceStore, () => crypto.randomUUID()),
);

export function academyQueueFor(uid: string | null): AcademyMutationQueue {
  return queues(uid);
}

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
