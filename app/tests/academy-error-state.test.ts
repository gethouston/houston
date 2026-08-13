import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type AcademyRecord,
  serializeAcademyRecord,
} from "../src/lib/academy/academy-record.ts";
import {
  type AcademyStorePorts,
  academyLoadFailed,
  loadAcademyRecord,
} from "../src/lib/academy/academy-store.ts";

/**
 * A failed read of the Academy record is NOT an empty one.
 *
 * The record answers "what has this user finished". A read that reached no
 * engine and found nothing on the device looks exactly like a fresh account, so
 * the page would hand a Mission Director the rank of a cadet and offer "Start"
 * on a chapter they finished months ago. This is the scenario the Academy's
 * failure screen exists for: a hosted user whose pod is cold, on a device whose
 * mirror is empty.
 *
 * Driven through the store's ports, so it is the real load path that answers.
 */

const record = (patch: Partial<AcademyRecord> = {}): AcademyRecord => ({
  version: 1,
  chapters: {
    setup: { completedAt: "2026-08-01T10:00:00.000Z", experience: 50 },
  },
  lessons: {},
  usageByDevice: {},
  usageDay: null,
  usageToday: 0,
  streak: { current: 0, best: 0, lastActiveDay: null },
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...patch,
});

function ports(opts: {
  engineDown?: boolean;
  engine?: AcademyRecord;
  mirror?: AcademyRecord;
}): AcademyStorePorts {
  let local = opts.mirror ? serializeAcademyRecord(opts.mirror) : null;
  return {
    getPreference: async () => {
      if (opts.engineDown) throw new Error("pod is still waking");
      return opts.engine ? serializeAcademyRecord(opts.engine) : null;
    },
    setPreference: async () => {},
    readLocal: () => local,
    writeLocal: (value) => {
      local = value;
    },
  };
}

describe("a read the engine refused", () => {
  it("is a failure, not an empty record, when the device holds nothing", async () => {
    const result = await loadAcademyRecord(ports({ engineDown: true }));
    strictEqual(result.record, null);
    strictEqual(result.engineRead, false);
    strictEqual(academyLoadFailed(result), true);
  });

  it("renders what the device holds rather than a failure", async () => {
    // A local record is a real answer about this user; refusing to draw it
    // because the pod was slow would hide progress the device can prove.
    const earned = record();
    const result = await loadAcademyRecord(
      ports({ engineDown: true, mirror: earned }),
    );
    deepStrictEqual(result.record, earned);
    strictEqual(result.engineRead, false);
    strictEqual(academyLoadFailed(result), false);
  });
});

describe("a read the engine answered", () => {
  it("reads an empty account as empty, never as a failure", async () => {
    // "This user has earned nothing yet" is the answer a fresh account gets,
    // and the path must offer Start on it.
    const result = await loadAcademyRecord(ports({}));
    strictEqual(result.record, null);
    strictEqual(result.engineRead, true);
    strictEqual(academyLoadFailed(result), false);
  });

  it("reads a stored record as itself", async () => {
    const stored = record();
    const result = await loadAcademyRecord(ports({ engine: stored }));
    deepStrictEqual(result.record, stored);
    strictEqual(academyLoadFailed(result), false);
  });
});
