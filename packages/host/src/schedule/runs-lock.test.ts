import { expect, test } from "vitest";
import { storeSyncRunsLock, withRunsFile } from "./runs-lock";

const lock = storeSyncRunsLock("workspaces");
const RUNS = "workspaces/Personal/Bob/.houston/routine_runs/routine_runs.json";

function held(root: string, order: string[]) {
  let release = () => {};
  const done = withRunsFile(root, async () => {
    order.push("host");
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  return { done, release: () => release() };
}

test("the daemon's rewrite of an agent's runs waits for that agent's queue", async () => {
  const order: string[] = [];
  const host = held("Personal/Bob", order);
  const rewrite = lock(RUNS, async () => {
    order.push("daemon");
  });
  const next = withRunsFile("Personal/Bob", async () => {
    order.push("next");
  });
  await Promise.resolve();
  host.release();
  await Promise.all([host.done, rewrite, next]);
  expect(order).toEqual(["host", "daemon", "next"]);
});

test("other agents and other files never wait on the queue", async () => {
  const order: string[] = [];
  const host = held("Personal/Bob", order);
  await lock(
    "workspaces/Personal/Ann/.houston/routine_runs/routine_runs.json",
    async () => {
      order.push("other agent");
    },
  );
  await lock(
    "workspaces/Personal/Bob/.houston/routines/routines.json",
    async () => {
      order.push("other file");
    },
  );
  host.release();
  await host.done;
  expect(order).toEqual(["host", "other agent", "other file"]);
});
