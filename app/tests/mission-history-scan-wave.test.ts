import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  createMissionHistoryScanner,
  type ScanItem,
} from "../src/components/mission-history-scan-wave.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Missions whose title/description contain no "b", so every phrase in these
 *  tests can only be answered by loading the transcript. */
function missions(count: number): ScanItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    title: `Mission ${i}`,
    description: `Notes ${i}`,
  }));
}

interface Gate {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
}

/** Drives the scanner with fully controlled loads: a transcript settles only
 *  when the test says so, which is what makes the superseded-wave interleaving
 *  reproducible instead of timing-dependent. */
function harness(options: { concurrency?: number; failing?: string[] } = {}) {
  const failing = new Set(options.failing ?? []);
  const started: string[] = [];
  const gates = new Map<string, Gate>();
  const committed = new Map<string, string>();
  /** Every spinner transition, in order — the flag must not blink off mid-scan. */
  const flips: boolean[] = [];
  let errors = 0;

  const scanner = createMissionHistoryScanner<ScanItem>({
    concurrency: options.concurrency ?? 5,
    loadTranscript: (item) => {
      started.push(item.id);
      return new Promise<string>((resolve, reject) => {
        gates.set(item.id, { resolve, reject });
      });
    },
    onTranscript: (id, text) => {
      committed.set(id, text);
    },
    onScanningChange: (value) => {
      flips.push(value);
    },
    onLoadError: () => {
      errors += 1;
    },
  });

  /** Settle every open load, and keep settling whatever that starts, until the
   *  scanner stops opening new ones. */
  const settleAll = async (): Promise<void> => {
    for (let round = 0; round < 50 && gates.size > 0; round++) {
      const open = [...gates.entries()];
      gates.clear();
      for (const [id, gate] of open) {
        if (failing.has(id)) gate.reject(new Error(`load failed: ${id}`));
        else gate.resolve(`transcript ${id}`);
      }
      await tick();
    }
  };

  return {
    scanner,
    started,
    committed,
    flips,
    settleAll,
    openGates: () => gates.size,
    errorCount: () => errors,
  };
}

/** Silences (and records) the load-failure diagnostic for one test. */
async function withSilencedConsoleError(
  body: (logged: unknown[][]) => Promise<void>,
): Promise<void> {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    await body(logged);
  } finally {
    console.error = original;
  }
}

describe("mission history scan wave", () => {
  it("scans every mission a superseded wave never started", async () => {
    // The regression: 20 missions, 5 in flight. Typing "b" claims all 20 and
    // starts 5; "budget" lands while the other 15 are still claimed, so the new
    // wave sees nothing missing and returns. When wave one settles it releases
    // those 15 — and nothing was left to pick them up, so 15 of 20 transcripts
    // were never read and the board said "search complete".
    const h = harness({ concurrency: 5 });
    const items = missions(20);

    h.scanner.scan(items, "b");
    await tick();
    strictEqual(h.started.length, 5, "first wave starts exactly `concurrency`");
    deepStrictEqual(h.flips, [true], "spinner is on while the wave runs");

    h.scanner.scan(items, "budget");
    await h.settleAll();

    strictEqual(h.committed.size, 20, "every mission ends up scanned");
    deepStrictEqual(
      [...h.committed.keys()].sort(),
      items.map((item) => item.id).sort(),
    );
    deepStrictEqual(
      h.flips,
      [true, false],
      "spinner turns off exactly once, at the end",
    );
  });

  it("keeps re-launching across repeated phrase changes", async () => {
    const h = harness({ concurrency: 2 });
    const items = missions(6);

    h.scanner.scan(items, "b");
    await tick();
    h.scanner.scan(items, "bu");
    await tick();
    h.scanner.scan(items, "bud");
    await h.settleAll();

    strictEqual(h.committed.size, 6);
    strictEqual(h.openGates(), 0, "no load is left dangling");
    deepStrictEqual(h.flips, [true, false]);
  });

  it("never re-loads a transcript it already holds", async () => {
    const h = harness({ concurrency: 5 });
    const items = missions(8);

    h.scanner.scan(items, "b");
    await h.settleAll();
    strictEqual(h.started.length, 8);

    h.scanner.scan(items, "budget");
    await h.settleAll();
    strictEqual(h.started.length, 8, "cached transcripts are reused as-is");
    deepStrictEqual(
      h.flips,
      [true, false],
      "no second spinner for a cache hit",
    );
  });

  it("skips missions the phrase already matches by title or description", async () => {
    const h = harness({ concurrency: 5 });
    const items: ScanItem[] = [
      { id: "title", title: "Budget review", description: "Notes" },
      { id: "body", title: "Weekly report", description: "The budget notes" },
      { id: "deep", title: "Customer call", description: "Notes" },
    ];

    h.scanner.scan(items, "budget");
    await h.settleAll();

    deepStrictEqual(h.started, ["deep"]);
  });

  it("records a failed load as empty and surfaces the error once per wave", async () => {
    await withSilencedConsoleError(async (logged) => {
      const h = harness({ concurrency: 5, failing: ["m1", "m2"] });
      const items = missions(4);

      h.scanner.scan(items, "b");
      await h.settleAll();

      strictEqual(h.committed.get("m1"), "");
      strictEqual(h.committed.get("m2"), "");
      strictEqual(h.committed.get("m0"), "transcript m0");
      strictEqual(h.errorCount(), 1, "two failures, one toast");
      strictEqual(logged.length, 2);
      strictEqual(logged[0][0], "[mission-search] history load failed");

      // A failure is remembered as an empty transcript, so the next phrase does
      // not retry it on every keystroke.
      h.scanner.scan(items, "budget");
      await h.settleAll();
      strictEqual(h.started.length, 4);
    });
  });

  it("scans nothing for an empty phrase", async () => {
    const h = harness({ concurrency: 5 });

    h.scanner.scan(missions(5), "");
    await h.settleAll();

    strictEqual(h.started.length, 0);
    deepStrictEqual(h.flips, [], "the spinner never came on");
  });

  it("stops starting work after stop(), and commits what is in flight", async () => {
    const h = harness({ concurrency: 2 });
    const items = missions(6);

    h.scanner.scan(items, "b");
    await tick();
    strictEqual(h.started.length, 2);

    h.scanner.stop();
    await h.settleAll();

    strictEqual(h.started.length, 2, "no further loads are started");
    strictEqual(h.committed.size, 2, "in-flight loads still commit");

    h.scanner.scan(items, "budget");
    await h.settleAll();
    strictEqual(h.started.length, 2, "a stopped scanner stays stopped");
  });
});
