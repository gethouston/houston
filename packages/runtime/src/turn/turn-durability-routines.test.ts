import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { landOp } from "./turn-views-op.test-support";
import {
  agentStore,
  claimedTurn,
  holdFirstGet,
  podDocs,
  ROUTINES_REL,
  routine,
  storedRoutines,
} from "./turn-views.test-support";

/**
 * The gateway serves a sleeping agent's Routines tab from the routines doc.
 * Every pooled writer (a turn's save_routine, the user's edit through an op)
 * republishes it, so these pin that no publish ever puts an older copy of the
 * routines over a concurrent writer's newer one.
 */

const prompts = (doc: unknown) =>
  Object.fromEntries(
    (doc as { id: string; prompt: string }[]).map((r) => [r.id, r.prompt]),
  );

test("a turn that publishes late never rolls back a routine the user edited after its save", async () => {
  // The turn lands its new routine, then stalls before its doc GET. The
  // user's edit of another routine lands and projects in that window. The
  // turn's own copy predates the edit and must not be what lands.
  const gate = holdFirstGet("routines", "c1");
  const agent = await agentStore([routine("r1", "Morning brief")]);
  const docs = podDocs(
    { routines: await storedRoutines(agent) },
    { hold: gate.hold },
  );
  const turn = await claimedTurn(agent, docs, "c1");
  await turn.saveRoutine({
    name: "Weekly",
    prompt: "Sum up the week",
    schedule: "0 9 * * 1",
  });
  const settled = turn.settle();
  await gate.atGet;
  const edit = await landOp(agent, docs, {
    method: "PATCH",
    rest: "routines/r1",
    body: { prompt: "Evening brief" },
  });
  await edit();
  gate.release();
  const result = await settled;

  expect(docs.doc("routines")).toEqual(await storedRoutines(agent));
  expect(prompts(docs.doc("routines"))).toMatchObject({
    r1: "Evening brief",
  });
  expect(docs.doc("routines")).toHaveLength(2);
  expect(result.changed).toContain("RoutinesChanged");
});

test("an op that projects after a turn keeps the turn's routine", async () => {
  // The user's edit lands from a tree listed before the turn's save_routine,
  // then the turn lands and publishes. The op's own copy lacks the turn's
  // routine, so projecting it would drop that routine from the tab.
  const agent = await agentStore([routine("r1", "Morning brief")]);
  const docs = podDocs({ routines: await storedRoutines(agent) });
  const edit = await landOp(agent, docs, {
    method: "PATCH",
    rest: "routines/r1",
    body: { prompt: "Evening brief" },
  });
  const turn = await claimedTurn(agent, docs);
  await turn.saveRoutine({
    name: "Weekly",
    prompt: "Sum up the week",
    schedule: "0 9 * * 1",
  });
  await turn.settle();

  const announced = await edit();

  expect(docs.doc("routines")).toEqual(await storedRoutines(agent));
  expect(docs.doc("routines")).toHaveLength(2);
  expect(announced).toContain("RoutinesChanged");
});

const newRoutine = {
  name: "Weekly",
  prompt: "Sum up the week",
  schedule: "0 9 * * 1",
};

test("a turn's routine save never resurrects a routine the user deleted mid-turn", async () => {
  // The turn hydrated both routines. The user deletes one; the turn's
  // save_routine then refreshes the file from the store before its write.
  const agent = await agentStore([
    routine("r1", "Morning brief"),
    routine("r0", "Old digest"),
  ]);
  const docs = podDocs({ routines: await storedRoutines(agent) });
  const turn = await claimedTurn(agent, docs);
  const remove = await landOp(agent, docs, {
    method: "DELETE",
    rest: "routines/r0",
  });
  await remove();
  await turn.saveRoutine(newRoutine);
  await turn.settle();

  const stored = await storedRoutines(agent);
  expect(stored.map((r) => r.id)).not.toContain("r0");
  expect(stored).toHaveLength(2);
  expect(docs.doc("routines")).toEqual(stored);
});

test("a turn's routine save never puts its stale copy back over the user's edit", async () => {
  const agent = await agentStore([routine("r1", "Morning brief")]);
  const docs = podDocs({ routines: await storedRoutines(agent) });
  const turn = await claimedTurn(agent, docs);
  const edit = await landOp(agent, docs, {
    method: "PATCH",
    rest: "routines/r1",
    body: { prompt: "Evening brief" },
  });
  await edit();
  await turn.saveRoutine(newRoutine);
  await turn.settle();

  const stored = await storedRoutines(agent);
  expect(prompts(stored)).toMatchObject({ r1: "Evening brief" });
  expect(stored).toHaveLength(2);
  expect(docs.doc("routines")).toEqual(stored);
});

test("a routine the user deletes stays deleted when a turn lands a routine during the op", async () => {
  // The op read the file, removed r0, and lost its upload race to the
  // turn's save_routine. Merging into the store's copy must not bring r0
  // back, and must keep the turn's routine.
  const agent = await agentStore([
    routine("r1", "Morning brief"),
    routine("r0", "Old digest"),
  ]);
  const docs = podDocs({ routines: await storedRoutines(agent) });
  const turn = await claimedTurn(agent, docs);
  const remove = await landOp(
    agent,
    docs,
    { method: "DELETE", rest: "routines/r0" },
    { beforeSync: () => turn.saveRoutine(newRoutine) },
  );
  await turn.settle();
  await remove();

  const stored = await storedRoutines(agent);
  expect(stored.map((r) => r.id)).not.toContain("r0");
  expect(stored.map((r) => r.name).sort()).toEqual(["Routine r1", "Weekly"]);
  expect(docs.doc("routines")).toEqual(stored);
});

test("a user's routine edit never reverts the routine a turn paused during the op", async () => {
  // The op hydrated r1 and r2, edited r1, and lost its upload race to the
  // turn pausing r2. The op's untouched copy of r2 must not land.
  const agent = await agentStore([
    routine("r1", "Morning brief"),
    routine("r2", "Inbox sweep"),
  ]);
  const docs = podDocs({ routines: await storedRoutines(agent) });
  const turn = await claimedTurn(agent, docs);
  const edit = await landOp(
    agent,
    docs,
    { method: "PATCH", rest: "routines/r1", body: { prompt: "Evening brief" } },
    { beforeSync: () => turn.saveRoutine({ id: "r2", enabled: false }) },
  );
  await turn.settle();
  await edit();

  const stored = await storedRoutines(agent);
  expect(prompts(stored)).toMatchObject({ r1: "Evening brief" });
  expect(stored.find((r) => r.id === "r2")?.enabled).toBe(false);
  expect(docs.doc("routines")).toEqual(stored);
});

test("an op projecting a routines file another writer left salvageable never publishes it empty", async () => {
  // Another writer's raw write left trailing bytes after valid JSON. Every
  // other reader salvages it; the op's projection must too, not put [] over
  // the routines.
  const agent = await agentStore([routine("r1", "Morning brief")]);
  const docs = podDocs({ routines: await storedRoutines(agent) });
  const edit = await landOp(agent, docs, {
    method: "PATCH",
    rest: "routines/r1",
    body: { prompt: "Evening brief" },
  });
  const path = join(agent.prefixRoot, ...ROUTINES_REL.split("/"));
  await writeFile(path, `${await readFile(path, "utf8")}\n}`);
  await edit();

  expect(prompts(docs.doc("routines"))).toEqual({ r1: "Evening brief" });
});

test("a routines doc the store will not take is never announced", async () => {
  const agent = await agentStore([routine("r1", "Morning brief")]);
  const standing = await storedRoutines(agent);
  const docs = podDocs({ routines: standing }, { outOfScope: ["routines"] });
  const edit = await landOp(agent, docs, {
    method: "PATCH",
    rest: "routines/r1",
    body: { prompt: "Evening brief" },
  });
  const turn = await claimedTurn(agent, docs);
  await turn.saveRoutine(newRoutine);

  const result = await turn.settle();
  const announced = await edit();

  expect(result.outcome).toEqual({});
  expect(result.changed).not.toContain("RoutinesChanged");
  expect(announced).not.toContain("RoutinesChanged");
  expect(docs.doc("routines")).toEqual(standing);
});
