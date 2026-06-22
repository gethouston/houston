import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HoustonEvent } from "@houston/protocol";
import { FsWatcher } from "./watcher";

/**
 * A real fs.watch over a temp tree: a file write surfaces as a classified,
 * debounced event. Timing-tolerant — we wait up to a budget for the event.
 */
test("a write under an agent's .houston surfaces a debounced ActivityChanged", async () => {
  const root = mkdtempSync(join(tmpdir(), "houston-watch-"));
  const agentDir = join(root, "Work", "Sales", ".houston", "activity");
  mkdirSync(agentDir, { recursive: true });

  const events: HoustonEvent[] = [];
  const watcher = new FsWatcher(root, (e) => events.push(e), 50);
  watcher.start();

  try {
    // Give the recursive watch a moment to arm, then write.
    await new Promise((r) => setTimeout(r, 100));
    writeFileSync(
      join(agentDir, "activity.json"),
      JSON.stringify([{ id: "a1" }]),
    );

    const deadline = Date.now() + 3000;
    while (events.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toEqual({
      type: "ActivityChanged",
      agentPath: "Work/Sales",
    } as never);
  } finally {
    watcher.stop();
  }
});

test("stop() halts delivery", async () => {
  const root = mkdtempSync(join(tmpdir(), "houston-watch-"));
  mkdirSync(join(root, "W", "A"), { recursive: true });
  const events: HoustonEvent[] = [];
  const watcher = new FsWatcher(root, (e) => events.push(e), 20);
  watcher.start();
  watcher.stop();
  writeFileSync(join(root, "W", "A", "file.txt"), "x");
  await new Promise((r) => setTimeout(r, 200));
  expect(events).toHaveLength(0);
});
