import { mergeAcademyRecords } from "./academy-merge.ts";
import {
  ACADEMY_PREF_KEY,
  type AcademyRecord,
  serializeAcademyRecord,
} from "./academy-record.ts";
import { parseAcademyRecord } from "./academy-record-parse.ts";
import {
  type AcademyStorePorts,
  loadAcademyRecord,
  saveAcademyRecord,
} from "./academy-store.ts";

export const UNKNOWN_DEVICE_ID = "unknown-device";

export type AcademyMutation<T extends AcademyRecord | null> = (
  record: AcademyRecord | null,
  deviceId: string,
) => T;

export interface AcademyMutationQueue {
  run<T extends AcademyRecord | null>(mutate: AcademyMutation<T>): Promise<T>;
  commitSync(mutate: AcademyMutation<AcademyRecord | null>): void;
}

export function createAcademyMutationQueue(
  ports: AcademyStorePorts,
  getDeviceId: () => string,
): AcademyMutationQueue {
  let tail: Promise<unknown> = Promise.resolve();
  let known: AcademyRecord | null = null;
  let deviceId: string | null = null;

  const resolveDeviceId = (): string => {
    if (deviceId !== null) return deviceId;
    let id: string;
    try {
      id = getDeviceId().trim();
    } catch {
      id = "";
    }
    deviceId = id || UNKNOWN_DEVICE_ID;
    return deviceId;
  };

  const knownNow = (): AcademyRecord | null =>
    mergeAcademyRecords(known, parseAcademyRecord(ports.readLocal()));

  async function commit<T extends AcademyRecord | null>(
    mutate: AcademyMutation<T>,
  ): Promise<T> {
    const id = resolveDeviceId();
    const { record: current } = await loadAcademyRecord(ports);
    const next = mutate(current, id);
    if (next === null || next === current) {
      known = current;
      return next;
    }
    const committed = mergeAcademyRecords(next, knownNow()) ?? next;
    known = committed;
    await saveAcademyRecord(ports, committed);
    return committed as T;
  }

  return {
    run(mutate) {
      const result = tail.then(() => commit(mutate));
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    commitSync(mutate) {
      const base = knownNow();
      const next = mutate(base, resolveDeviceId());
      if (!next || next === base) return;
      known = next;
      const serialized = serializeAcademyRecord(next);
      ports.writeLocal(serialized);
      void ports.setPreference(ACADEMY_PREF_KEY, serialized).catch((e) => {
        console.error("[academy] teardown engine write failed", e);
      });
    },
  };
}

export function createAcademyQueues(
  createPorts: (uid: string | null) => AcademyStorePorts,
  getDeviceId: () => string,
): (uid: string | null) => AcademyMutationQueue {
  const queues = new Map<string | null, AcademyMutationQueue>();
  return (uid) => {
    const existing = queues.get(uid);
    if (existing) return existing;
    const queue = createAcademyMutationQueue(createPorts(uid), getDeviceId);
    queues.set(uid, queue);
    return queue;
  };
}
