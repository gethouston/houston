import { saveActivities } from "@houston/domain";
import { afterEach, expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { MAX_AGENT_STARTED_MISSIONS, missionFanout } from "./mission-fanout";

/**
 * The caller-side budget: what ONE agent has out across every board. A per-board
 * cap cannot see it, which is the whole reason this ledger exists.
 */

const CALLER = "ws/Helper";
const ROOT = "workspaces/ws/Dobby";

afterEach(() => missionFanout.forget(CALLER));

const row = (id: string, status: string) => ({
  id,
  title: id,
  description: "",
  status,
});

test("an agent with nothing out has spent nothing", async () => {
  expect(await missionFanout.running(CALLER, new MemoryVfs())).toBe(0);
});

test("a local start stops counting once its row is no longer running", async () => {
  const vfs = new MemoryVfs();
  await saveActivities(vfs, ROOT, [row("m-1", "running"), row("m-2", "done")]);
  missionFanout.record(CALLER, { missionId: "m-1", boardRoot: ROOT });
  missionFanout.record(CALLER, { missionId: "m-2", boardRoot: ROOT });
  // m-3 was deleted from the board entirely.
  missionFanout.record(CALLER, { missionId: "m-3", boardRoot: ROOT });
  expect(await missionFanout.running(CALLER, vfs)).toBe(1);
});

test("a cross-pod start holds its slot, then ages out", async () => {
  const vfs = new MemoryVfs();
  const started = Date.now();
  missionFanout.record(CALLER, { missionId: "m-r", boardRoot: null }, started);
  expect(await missionFanout.running(CALLER, vfs, started + 60_000)).toBe(1);
  expect(
    await missionFanout.running(CALLER, vfs, started + 24 * 3600_000),
  ).toBe(0);
});

test("a reserved slot can be given back when the start failed", async () => {
  missionFanout.record(CALLER, { missionId: "m-r", boardRoot: null });
  missionFanout.release(CALLER, "m-r");
  expect(await missionFanout.running(CALLER, new MemoryVfs())).toBe(0);
});

test("the budget counts starts spread over MANY boards", async () => {
  const vfs = new MemoryVfs();
  for (let i = 0; i < MAX_AGENT_STARTED_MISSIONS; i++) {
    const root = `${ROOT}-${i}`;
    await saveActivities(vfs, root, [row(`m-${i}`, "running")]);
    missionFanout.record(CALLER, { missionId: `m-${i}`, boardRoot: root });
  }
  // Not one board holds more than a single mission, and the caller is full.
  expect(await missionFanout.running(CALLER, vfs)).toBe(
    MAX_AGENT_STARTED_MISSIONS,
  );
});

test("agents keep their own budgets", async () => {
  missionFanout.record(CALLER, { missionId: "m-r", boardRoot: null });
  expect(await missionFanout.running("ws/Other", new MemoryVfs())).toBe(0);
});
