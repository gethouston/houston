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

const record = (patch: Partial<AcademyRecord> = {}): AcademyRecord => ({
  version: 1,
  chapters: {
    setup: { completedAt: "2026-08-01T10:00:00.000Z", experience: 50 },
  },
  lessons: {},
  lessonPositions: {},
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
