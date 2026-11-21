import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeActivities, parseJsonDoc } from "@houston/domain";
import { expect, test } from "vitest";
import {
  type AgentStore,
  agentStore,
  claimedTurn,
  holdFirstGet,
  podDocs,
  seed,
  WORKSPACE_REL,
} from "./turn-views.test-support";

const BOARD = ".houston/activity/activity.json";

const card = (id: string, status: string, at: string) => ({
  id,
  title: `Mission ${id}`,
  status,
  updated_at: `2026-10-01T${at}:00.000Z`,
});

async function storedBoard(agent: AgentStore) {
  const rel = `${WORKSPACE_REL}/${BOARD}`;
  const raw = await readFile(join(agent.prefixRoot, ...rel.split("/")), "utf8");
  return normalizeActivities(parseJsonDoc(raw, rel), rel).items;
}

const moveCard = async (
  turn: Awaited<ReturnType<typeof claimedTurn>>,
  id: string,
  status: string,
) => {
  const path = join(turn.filesystem.workspaceDir, ...BOARD.split("/"));
  const board = JSON.parse(await readFile(path, "utf8")) as Array<
    ReturnType<typeof card>
  >;
  await seed(
    turn.filesystem.workspaceDir,
    BOARD,
    JSON.stringify(
      board.map((c) =>
        c.id === id
          ? { ...c, status, updated_at: new Date().toISOString() }
          : c,
      ),
    ),
  );
};

test("a turn that publishes its board late never rolls back a newer turn's card", async () => {
  const gate = holdFirstGet("activity", "c1");
  const agent = await agentStore();
  await seed(
    agent.prefixRoot,
    `${WORKSPACE_REL}/${BOARD}`,
    JSON.stringify([
      card("a", "running", "09:00"),
      card("b", "running", "09:00"),
    ]),
  );
  const docs = podDocs(
    { activity: await storedBoard(agent) },
    { hold: gate.hold },
  );
  const first = await claimedTurn(agent, docs, "c1");
  await moveCard(first, "a", "done");
  const firstSettled = first.settle();
  await gate.atGet;
  const second = await claimedTurn(agent, docs, "c2");
  await moveCard(second, "b", "done");
  await second.settle();
  gate.release();
  const result = await firstSettled;

  expect(docs.doc("activity")).toEqual(await storedBoard(agent));
  expect(
    (docs.doc("activity") as { status: string }[]).map((c) => c.status),
  ).toEqual(["done", "done"]);
  expect(result.changed).toContain("ActivityChanged");
});

test("a board or run history doc the store will not take is never announced", async () => {
  const agent = await agentStore();
  await seed(
    agent.prefixRoot,
    `${WORKSPACE_REL}/${BOARD}`,
    JSON.stringify([card("a", "running", "09:00")]),
  );
  const docs = podDocs(
    { activity: await storedBoard(agent), routine_runs: [] },
    { outOfScope: ["activity", "routine_runs"] },
  );
  const turn = await claimedTurn(agent, docs, "c1", { routine: true });
  await moveCard(turn, "a", "done");
  await seed(
    turn.filesystem.workspaceDir,
    ".houston/routine_runs/routine_runs.json",
    JSON.stringify([
      {
        id: "run-1",
        routine_id: "r1",
        status: "surfaced",
        session_key: "routine-r1",
        started_at: "2026-10-01T09:00:00.000Z",
        completed_at: "2026-10-01T09:01:00.000Z",
      },
    ]),
  );

  const result = await turn.settle();

  expect(result.outcome).toEqual({});
  expect(result.changed).not.toContain("ActivityChanged");
  expect(result.changed).not.toContain("RoutineRunsChanged");
});
