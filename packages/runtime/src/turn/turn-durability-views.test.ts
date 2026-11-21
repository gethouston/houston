import { rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  type AgentStore,
  agentStore,
  claimedTurn,
  holdFirstGet,
  type PodDocs,
  podDocs,
  podLearnings,
  podSkillsAnswer,
  raceFirstUpload,
  seed,
  skillNames,
  writeSkill,
} from "./turn-views.test-support";
import { landOp } from "./turn-views-op.test-support";

test("a turn that adds a skill republishes the skills view and announces it", async () => {
  const agent = await agentStore();
  const docs = podDocs({ skills: await podSkillsAnswer(agent) });
  const { filesystem, settle } = await claimedTurn(agent, docs);
  await writeSkill(filesystem, "drafting", "Draft replies");

  const result = await settle();

  expect(result.outcome).toEqual({});
  expect(docs.doc("skills")).toEqual(await podSkillsAnswer(agent));
  expect(
    (docs.doc("skills") as { items: { name: string }[] }).items.map(
      (item) => item.name,
    ),
  ).toEqual(["drafting", "existing"]);
  expect(result.changed).toContain("SkillsChanged");
});

test("a turn that deletes a skill drops it from the view and announces it", async () => {
  const agent = await agentStore();
  const docs = podDocs({ skills: await podSkillsAnswer(agent) });
  const { filesystem, settle } = await claimedTurn(agent, docs);
  await rm(join(filesystem.workspaceDir, ".agents", "skills", "existing"), {
    recursive: true,
  });

  const result = await settle();

  expect(docs.doc("skills")).toEqual({ items: [], diagnostics: [] });
  expect(docs.doc("skills")).toEqual(await podSkillsAnswer(agent));
  expect(result.changed).toContain("SkillsChanged");
});

test("a turn that changes no skill or memory republishes nothing", async () => {
  const agent = await agentStore();
  const docs = podDocs({ skills: await podSkillsAnswer(agent) });
  const { filesystem, settle } = await claimedTurn(agent, docs);
  await seed(filesystem.workspaceDir, "notes.md", "draft\n");
  await seed(filesystem.workspaceDir, ".agents/skills/existing/run.py", "1\n");

  const result = await settle();

  expect(docs.requests).toEqual([]);
  expect(result.changed).toEqual(["FilesChanged", "SkillsChanged"]);
});

test("overlapping turns keep each other's skills in the view", async () => {
  const agent = await agentStore();
  const docs = podDocs({ skills: await podSkillsAnswer(agent) });
  const first = await claimedTurn(agent, docs, "c1");
  const second = await claimedTurn(agent, docs, "c2");
  await writeSkill(first.filesystem, "alpha", "First turn's");
  await writeSkill(second.filesystem, "beta", "Second turn's");

  await first.settle();
  await second.settle();

  expect(skillNames(docs)).toEqual(["alpha", "beta", "existing"]);
  expect(docs.doc("skills")).toEqual(await podSkillsAnswer(agent));
});

test("turns settling at once merge into the view, never clobber", async () => {
  const agent = await agentStore();
  const docs = podDocs({ skills: await podSkillsAnswer(agent) });
  const turns = await Promise.all(
    ["c1", "c2", "c3"].map((cid) => claimedTurn(agent, docs, cid)),
  );
  await Promise.all(
    turns.map((turn, i) => writeSkill(turn.filesystem, `s${i}`, `Turn ${i}`)),
  );
  await rm(
    join(turns[2]?.filesystem.workspaceDir ?? "", ".agents/skills/existing"),
    { recursive: true },
  );

  const results = await Promise.all(turns.map((turn) => turn.settle()));

  expect(skillNames(docs)).toEqual(["s0", "s1", "s2"]);
  expect(docs.doc("skills")).toEqual(await podSkillsAnswer(agent));
  for (const result of results)
    expect(result.changed).toContain("SkillsChanged");
});

test("with no skills doc yet, the whole captured list is published", async () => {
  const agent = await agentStore();
  const docs = podDocs();
  const { filesystem, settle } = await claimedTurn(agent, docs);
  await writeSkill(filesystem, "drafting", "Draft replies");

  await settle();

  expect(docs.doc("skills")).toEqual(await podSkillsAnswer(agent));
});

test("a skills view that did not land is not announced and fails nothing", async () => {
  const agent = await agentStore();
  const standing = await podSkillsAnswer(agent);
  const docs = podDocs({ skills: standing }, { refusing: ["skills"] });
  const { filesystem, settle } = await claimedTurn(agent, docs);
  await writeSkill(filesystem, "drafting", "Draft replies");
  await seed(filesystem.workspaceDir, "notes.md", "draft\n");

  const result = await settle();

  expect(result.outcome).toEqual({});
  expect(docs.doc("skills")).toEqual(standing);
  expect(result.changed).toEqual(["FilesChanged"]);
});

test("a turn that saves a memory republishes the learnings doc and announces it", async () => {
  const agent = await agentStore();
  const docs = podDocs({ learnings: await podLearnings(agent) });
  const { settle, saveLearning } = await claimedTurn(agent, docs);
  await saveLearning("Prefers mornings");

  const result = await settle();

  expect(result.outcome).toEqual({});
  expect(docs.doc("learnings")).toEqual(await podLearnings(agent));
  expect(
    (docs.doc("learnings") as { text: string }[]).map((item) => item.text),
  ).toEqual(["Signs off as Ana", "Prefers mornings"]);
  expect(result.changed).toContain("LearningsChanged");
});

test("overlapping turns' memories all reach the doc, in the store's order", async () => {
  const agent = await agentStore();
  const docs = podDocs({ learnings: await podLearnings(agent) });
  const first = await claimedTurn(agent, docs, "c1");
  const second = await claimedTurn(agent, docs, "c2");
  await first.saveLearning("Prefers mornings");
  await second.saveLearning("Writes in Spanish");

  await second.settle();
  await first.settle();

  expect(docs.doc("learnings")).toEqual(await podLearnings(agent));
  expect(
    (docs.doc("learnings") as { text: string }[]).map((item) => item.text),
  ).toEqual(
    expect.arrayContaining([
      "Signs off as Ana",
      "Prefers mornings",
      "Writes in Spanish",
    ]),
  );
});

test("turns saving memories at once leave the doc equal to the store", async () => {
  const agent = await agentStore();
  const docs = podDocs({ learnings: await podLearnings(agent) });
  const turns = await Promise.all(
    ["c1", "c2", "c3"].map((cid) => claimedTurn(agent, docs, cid)),
  );
  for (const [i, turn] of turns.entries()) await turn.saveLearning(`Fact ${i}`);

  await Promise.all(turns.map((turn) => turn.settle()));

  expect(docs.doc("learnings")).toEqual(await podLearnings(agent));
  expect(docs.doc("learnings")).toHaveLength(4);
});

test("a learnings doc that did not land is not announced", async () => {
  const agent = await agentStore();
  const standing = await podLearnings(agent);
  const docs = podDocs({ learnings: standing }, { refusing: ["learnings"] });
  const { settle, saveLearning } = await claimedTurn(agent, docs);
  await saveLearning("Prefers mornings");

  const result = await settle();

  expect(result.outcome.error).toMatch(/learnings doc publish failed/);
  expect(docs.doc("learnings")).toEqual(standing);
  expect(result.changed).not.toContain("LearningsChanged");
});

test("a learnings doc the store will not take is not announced and fails nothing", async () => {
  const agent = await agentStore();
  const docs = podDocs(
    { learnings: await podLearnings(agent) },
    { outOfScope: ["learnings"] },
  );
  const { settle, saveLearning } = await claimedTurn(agent, docs);
  await saveLearning("Prefers mornings");

  const result = await settle();

  expect(result.outcome).toEqual({});
  expect(result.changed).not.toContain("LearningsChanged");
});

test("a turn that settles late never re-serves a skill summary another turn replaced", async () => {
  const gate = holdFirstGet("skills", "c1");
  const agent = await agentStore();
  const docs = podDocs(
    { skills: await podSkillsAnswer(agent) },
    { hold: gate.hold },
  );
  const first = await claimedTurn(agent, docs, "c1");
  await writeSkill(first.filesystem, "existing", "First edit");
  const firstSettled = first.settle();
  await gate.atGet;
  const second = await claimedTurn(agent, docs, "c2");
  await writeSkill(second.filesystem, "existing", "Second edit");
  await second.settle();
  gate.release();
  await firstSettled;

  expect(docs.doc("skills")).toEqual(await podSkillsAnswer(agent));
  expect(
    (docs.doc("skills") as { items: { description: string }[] }).items[0]
      ?.description,
  ).toBe("Second edit");
});

test("a turn that deletes the memories file republishes an empty doc", async () => {
  const agent = await agentStore();
  const docs = podDocs({ learnings: await podLearnings(agent) });
  const { filesystem, settle } = await claimedTurn(agent, docs);
  await rm(join(filesystem.workspaceDir, ".houston", "learnings"), {
    recursive: true,
  });

  const result = await settle();

  expect(docs.doc("learnings")).toEqual([]);
  expect(result.changed).toContain("LearningsChanged");
});

const landSkillCreateOp = (agent: AgentStore, docs: PodDocs, name: string) =>
  landOp(agent, docs, {
    method: "POST",
    rest: "skills",
    body: { name, description: `${name} op`, content: "Go" },
  });

test("an op that projects after a turn keeps the turn's skill", async () => {
  const agent = await agentStore();
  const docs = podDocs({ skills: await podSkillsAnswer(agent) });
  const turn = await claimedTurn(agent, docs);
  const project = await landSkillCreateOp(agent, docs, "alpha");
  await writeSkill(turn.filesystem, "beta", "The turn's");
  await turn.settle();

  const announced = await project();

  expect(skillNames(docs)).toEqual(["alpha", "beta", "existing"]);
  expect(docs.doc("skills")).toEqual(await podSkillsAnswer(agent));
  expect(announced).toContain("SkillsChanged");
});

test("an op that projects after a turn keeps the turn's memory", async () => {
  const agent = await agentStore();
  const docs = podDocs({ learnings: await podLearnings(agent) });
  const project = await landOp(agent, docs, {
    method: "PUT",
    rest: "learnings",
    body: {
      items: [
        ...(await podLearnings(agent)),
        { id: "l-op", text: "Saved from the tab", created_at: "2026-10-01" },
      ],
    },
  });
  const turn = await claimedTurn(agent, docs);
  await turn.saveLearning("Prefers mornings");
  await turn.settle();

  const announced = await project();

  expect(docs.doc("learnings")).toEqual(await podLearnings(agent));
  expect(docs.doc("learnings")).toHaveLength(3);
  expect(announced).toContain("LearningsChanged");
});

test("an op whose skills view the store would not take announces nothing", async () => {
  const agent = await agentStore();
  const docs = podDocs(
    { skills: await podSkillsAnswer(agent) },
    { outOfScope: ["skills"] },
  );
  const project = await landSkillCreateOp(agent, docs, "alpha");

  expect(await project()).toEqual([]);
});

test("an op whose learnings doc the store would not take announces nothing", async () => {
  const agent = await agentStore();
  const docs = podDocs(
    { learnings: await podLearnings(agent) },
    { outOfScope: ["learnings"] },
  );
  const project = await landOp(agent, docs, {
    method: "PUT",
    rest: "learnings",
    body: { items: [] },
  });

  expect(await project()).toEqual([]);
});

test("a memory deleted in the tab stays deleted when a turn saves another during the op", async () => {
  const agent = await agentStore();
  const docs = podDocs({ learnings: await podLearnings(agent) });
  const turn = await claimedTurn(agent, docs);
  const save = await landOp(
    agent,
    docs,
    { method: "PUT", rest: "learnings", body: { items: [] } },
    { beforeSync: () => turn.saveLearning("Prefers mornings") },
  );
  await turn.settle();
  await save();

  const stored = await podLearnings(agent);
  expect(stored.map((item) => item.text)).toEqual(["Prefers mornings"]);
  expect(docs.doc("learnings")).toEqual(stored);
});

test("a memory deleted while a turn's save retries stays deleted", async () => {
  const agent = await agentStore();
  const docs = podDocs({ learnings: await podLearnings(agent) });
  const turn = await claimedTurn(agent, docs);
  await seed(
    turn.filesystem.workspaceDir,
    ".houston/learnings/learnings.json",
    JSON.stringify([
      ...(await podLearnings(agent)),
      { id: "x", text: "Unsynced fact", created_at: "2026-09-02T00:00:00Z" },
    ]),
  );
  raceFirstUpload(agent.hooks, "learnings.json", async () => {
    const tab = await landOp(agent, docs, {
      method: "PUT",
      rest: "learnings",
      body: { items: [] },
    });
    await tab();
  });
  await turn.saveLearning("Prefers mornings");
  await turn.settle();

  const stored = await podLearnings(agent);
  expect(stored.map((item) => item.text)).toEqual([
    "Unsynced fact",
    "Prefers mornings",
  ]);
  expect(docs.doc("learnings")).toEqual(stored);
});

test("a memory a turn saves after the tab's op listed the store survives the tab's save", async () => {
  const agent = await agentStore();
  const docs = podDocs({ learnings: await podLearnings(agent) });
  const turn = await claimedTurn(agent, docs);
  const items = [
    ...(await podLearnings(agent)),
    { id: "l-tab", text: "Saved from the tab", created_at: "2026-10-01" },
  ];
  const save = await landOp(
    agent,
    docs,
    { method: "PUT", rest: "learnings", body: { items } },
    { beforeApply: () => turn.saveLearning("Prefers mornings") },
  );
  await turn.settle();
  await save();

  const stored = await podLearnings(agent);
  expect(stored.map((item) => item.text).sort()).toEqual([
    "Prefers mornings",
    "Saved from the tab",
    "Signs off as Ana",
  ]);
  expect(docs.doc("learnings")).toEqual(stored);
});

async function deleteMemoriesFile(agent: AgentStore, docs: PodDocs) {
  const other = await claimedTurn(agent, docs, "c-delete");
  await rm(join(other.filesystem.workspaceDir, ".houston", "learnings"), {
    recursive: true,
  });
  await other.settle();
}

test("a turn's memory save never brings back memories a deleted file held", async () => {
  const agent = await agentStore();
  const docs = podDocs({ learnings: await podLearnings(agent) });
  const turn = await claimedTurn(agent, docs);
  await deleteMemoriesFile(agent, docs);
  await turn.saveLearning("Prefers mornings");
  await turn.settle();

  const stored = await podLearnings(agent);
  expect(stored.map((item) => item.text)).toEqual(["Prefers mornings"]);
  expect(docs.doc("learnings")).toEqual(stored);
});

test("a turn's memories file edit never brings back memories a deleted file held", async () => {
  const agent = await agentStore();
  const docs = podDocs({ learnings: await podLearnings(agent) });
  const turn = await claimedTurn(agent, docs);
  await seed(
    turn.filesystem.workspaceDir,
    ".houston/learnings/learnings.json",
    JSON.stringify([
      ...(await podLearnings(agent)),
      { id: "x", text: "Written by hand", created_at: "2026-09-02T00:00:00Z" },
    ]),
  );
  await deleteMemoriesFile(agent, docs);
  await turn.settle();

  const stored = await podLearnings(agent);
  expect(stored.map((item) => item.text)).toEqual(["Written by hand"]);
  expect(docs.doc("learnings")).toEqual(stored);
});
