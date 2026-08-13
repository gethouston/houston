// The ONE way an Academy record is ever changed.
//
// A record is a read-modify-write over two stores, and it is written from three
// unrelated places: the onboarding finish path (a chapter), a finished lesson,
// and the usage economy's flush. Left to themselves they interleave — two of
// them load the same record and the second one saves over the first's award,
// which is a chapter or an afternoon of points silently gone. So every mutation
// queues here instead, per account, and each one loads afresh inside its own
// slot.
//
// Storage-agnostic: `./academy-ports.ts` supplies the live ports and the
// install id, so all of this is driven from `app/tests` with no engine.

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

/** The install a mutation credits when this device's own key cannot be read or
 *  kept ({@link import("./usage-device.ts").usageDeviceId}). Stable, so the
 *  points it earns still merge like any device's — just anonymously. */
export const UNKNOWN_DEVICE_ID = "unknown-device";

/** A pure change to the record: the loaded copy in, the next one out, and the
 *  SAME object back when there is nothing to do (so nothing is written). */
export type AcademyMutation<T extends AcademyRecord | null> = (
  record: AcademyRecord | null,
  deviceId: string,
) => T;

export interface AcademyMutationQueue {
  /** Runs `mutate` against a freshly loaded record. Waits for every mutation
   *  queued before it, so no two ever read the same copy. */
  run<T extends AcademyRecord | null>(mutate: AcademyMutation<T>): Promise<T>;
  /**
   * Applies `mutate` to what this device already knows and writes the mirror
   * SYNCHRONOUSLY, engine write best-effort behind it. For teardown only: a
   * closing window never gets its awaits back, so anything that has to survive
   * the shutdown cannot be behind one. The next load merges it back in.
   */
  commitSync(mutate: AcademyMutation<AcademyRecord | null>): void;
}

export function createAcademyMutationQueue(
  ports: AcademyStorePorts,
  getDeviceId: () => string,
): AcademyMutationQueue {
  let tail: Promise<unknown> = Promise.resolve();
  let known: AcademyRecord | null = null;
  let deviceId: string | null = null;

  /** The install this queue credits, read once. Synchronous by design: a
   *  teardown that never gets an await back still knows who earned the points. */
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

  /** Everything this device knows without awaiting: the last record it held,
   *  folded with whatever the mirror holds now (another window may have moved
   *  it on). Merging only ever grows, so this can never lose an award. */
  const knownNow = (): AcademyRecord | null =>
    mergeAcademyRecords(known, parseAcademyRecord(ports.readLocal()));

  async function commit<T extends AcademyRecord | null>(
    mutate: AcademyMutation<T>,
  ): Promise<T> {
    const id = resolveDeviceId();
    // A load that never reached the engine still carries whatever the device
    // knows, and merging only grows — so a mutation is safe to apply either
    // way. Only the SCREENS have to tell the two apart (`academyLoadFailed`).
    const { record: current } = await loadAcademyRecord(ports);
    const next = mutate(current, id);
    if (next === null || next === current) {
      known = current;
      return next;
    }
    // Fold in anything that landed WHILE this slot was loading — another
    // window's write, or a teardown's synchronous one. The queue serializes
    // this process; the mirror is what everyone else shares.
    const committed = mergeAcademyRecords(next, knownNow()) ?? next;
    known = committed;
    await saveAcademyRecord(ports, committed);
    // `next` is a record here, so `T` includes one — a fact the compiler
    // cannot carry through the merge.
    return committed as T;
  }

  return {
    run(mutate) {
      const result = tail.then(() => commit(mutate));
      // The chain must outlive a failure: one lost award must never stop the
      // next mutation from ever running. Callers still see their own rejection.
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
      ports.writeLocal(serialized); // localStorage is synchronous: durable NOW.
      void ports.setPreference(ACADEMY_PREF_KEY, serialized).catch((e) => {
        console.error("[academy] teardown engine write failed", e);
      });
    },
  };
}

/**
 * ONE queue per account, for the whole run of the app. Every award path asks
 * here rather than building its own, which is what makes the serialization
 * mean anything: two queues over one record are two writers again.
 */
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
