// Where Academy progress LIVES on a device: the account preference the engine
// holds (the source of truth) and its uid-scoped localStorage mirror.
//
// Every device-touching call goes through {@link AcademyStorePorts}, injected by
// the caller (`./academy-ports.ts` wires the live ones), so the durability rules
// below are driven directly by `app/tests` with no engine and no browser storage.

import { mergeAcademyRecords } from "./academy-merge.ts";
import {
  ACADEMY_PREF_KEY,
  type AcademyRecord,
  serializeAcademyRecord,
} from "./academy-record.ts";
import { parseAcademyRecord } from "./academy-record-parse.ts";

/** The two places progress is kept, as ports. The local key is baked in by the
 *  wiring (it is per-uid), so callers here never name it. */
export interface AcademyStorePorts {
  /** The ACCOUNT preference store — the engine (the user's pod, when hosted). */
  getPreference(key: string): Promise<string | null>;
  setPreference(key: string, value: string): Promise<void>;
  /** The device mirror. */
  readLocal(): string | null;
  writeLocal(value: string): void;
}

/** The raw device surfaces the ports are built from: ONE engine preference
 *  store (it serves whoever is signed in) and ONE keyed local store. */
export interface AcademyDevice {
  getPreference(key: string): Promise<string | null>;
  setPreference(key: string, value: string): Promise<void>;
  readLocal(key: string): string | null;
  writeLocal(key: string, value: string): void;
}

/**
 * Per-user localStorage key for the device mirror. Keyed by uid for the same
 * reason the survey mirror is: the engine preference lives on the user's pod in
 * hosted mode, so a pod blip must not reset earned progress, and two accounts on
 * one machine stay independent.
 */
export function academyLocalKey(uid: string | null): string {
  return `${ACADEMY_PREF_KEY}:${uid ?? "anon"}`;
}

/**
 * The ports for ONE account, guarded against the account changing under them.
 *
 * The mirror is keyed by uid, but the engine preference store is not: it serves
 * whichever account is authenticated RIGHT NOW. Points buffered for the user
 * who earned them can therefore land after a sign-out, and would then be
 * written into the NEXT user's preference — handing them a stranger's rank and
 * burying their own. So every engine call re-checks the account first:
 *
 * - READS raise, which the loader already knows how to survive (an unreachable
 *   engine is not an empty one, so the mirror answers and nothing is healed).
 * - WRITES are dropped. The uid-keyed mirror still takes them, so the progress
 *   survives on the device and reconciles into the engine the next time that
 *   user signs in and {@link loadAcademyRecord} heals.
 */
export function academyPortsFor(
  device: AcademyDevice,
  uid: string | null,
  getActiveUid: () => string | null,
): AcademyStorePorts {
  const localKey = academyLocalKey(uid);
  const serves = () => getActiveUid() === uid;
  return {
    getPreference: async (key) => {
      if (!serves()) throw new Error("[academy] account changed mid-read");
      const value = await device.getPreference(key);
      // The engine answered whoever it is serving NOW: if that stopped being
      // this account while the read was in flight, the answer is not ours.
      if (!serves()) throw new Error("[academy] account changed mid-read");
      return value;
    },
    setPreference: async (key, value) => {
      if (!serves()) return; // The mirror holds it; the next sign-in heals.
      await device.setPreference(key, value);
    },
    readLocal: () => device.readLocal(localKey),
    writeLocal: (value) => device.writeLocal(localKey, value),
  };
}

/** What a load found, and whether it heard from the engine at all. The second
 *  half is not bookkeeping: it is what separates "this user has earned nothing"
 *  from "nobody answered" (see {@link academyLoadFailed}). */
export interface AcademyLoad {
  record: AcademyRecord | null;
  /** The account preference was READ. False means the engine refused or never
   *  answered — a warming hosted pod, or the account changing mid-read. */
  engineRead: boolean;
}

/**
 * Both copies, merged. Neither side is trusted wholesale: the engine preference
 * lives on the user's pod in hosted mode, so a pod blip must never cost a
 * chapter the user cleared, and a device that has been offline must never
 * downgrade what another device earned ({@link mergeAcademyRecords} only grows).
 *
 * SELF-HEAL: the merged record is written back to the mirror, and pushed to the
 * preference when the engine's copy is behind it. That is what closes the
 * durability gap left by {@link saveAcademyRecord}'s non-blocking engine write.
 * A FAILED preference read heals nothing — the mirror simply answers, because
 * an unread engine is not the same as an empty one.
 */
export async function loadAcademyRecord(
  ports: AcademyStorePorts,
): Promise<AcademyLoad> {
  let raw: string | null = null;
  let engineRead = true;
  try {
    raw = await ports.getPreference(ACADEMY_PREF_KEY);
  } catch {
    engineRead = false; // Engine unreachable (hosted pod waking) — mirror answers.
  }
  const merged = mergeAcademyRecords(
    parseAcademyRecord(raw),
    parseAcademyRecord(ports.readLocal()),
  );
  if (!merged) return { record: null, engineRead };
  const serialized = serializeAcademyRecord(merged);
  ports.writeLocal(serialized);
  if (engineRead && raw !== serialized) {
    void ports.setPreference(ACADEMY_PREF_KEY, serialized).catch((e) => {
      console.error("[academy] engine pref heal failed", e);
    });
  }
  return { record: merged, engineRead };
}

/**
 * Whether a load is NO ANSWER rather than an empty one — the reading a screen
 * must refuse to draw.
 *
 * Only when both halves fail together: the engine was not read AND the device
 * had nothing to say. A record from the mirror is a real answer about this user
 * whatever the pod is doing, so it is drawn; and a user who has genuinely
 * earned nothing gets the empty path, with Start on the first chapter, not an
 * error. It is the third case — a cold hosted pod on a device with an empty
 * mirror — that would otherwise hand a Mission Director the rank of a cadet and
 * offer Start on a chapter they finished months ago.
 */
export function academyLoadFailed(load: AcademyLoad): boolean {
  return !load.engineRead && load.record === null;
}

/**
 * The mirror is written FIRST and the engine write may fail WITHOUT throwing —
 * the same trade the onboarding survey makes: a warming pod must not stall (or
 * lose) the reward the user just earned. The next {@link loadAcademyRecord}
 * heals the engine copy.
 */
export async function saveAcademyRecord(
  ports: AcademyStorePorts,
  record: AcademyRecord,
): Promise<void> {
  const serialized = serializeAcademyRecord(record);
  ports.writeLocal(serialized);
  try {
    await ports.setPreference(ACADEMY_PREF_KEY, serialized);
  } catch (e) {
    console.error("[academy] engine pref write failed", e);
  }
}
