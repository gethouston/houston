import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { startTurnCheckpoints } from "./turn-checkpoint";
import {
  type AgentStore,
  agentStore,
  claimedTurn,
  PREFIX,
  podDocs,
  seed,
  WORKSPACE_REL,
} from "./turn-views.test-support";

afterEach(() => {
  vi.restoreAllMocks();
});

type Turn = Awaited<ReturnType<typeof claimedTurn>>;

const toolEnd = { type: "tool_end", data: { name: "Write", isError: false } };

const until = async (check: () => boolean) => {
  for (let i = 0; i < 300 && !check(); i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
};

const edit = (turn: Turn, name: string, body: string) =>
  writeFile(join(turn.filesystem.workspaceDir, name), body);

async function staleTurn(names: string[]) {
  const agent = await agentStore();
  for (const name of names)
    await seed(agent.prefixRoot, `${WORKSPACE_REL}/${name}`, "original");
  const docs = podDocs({});
  const first = await claimedTurn(agent, docs, "c1");
  const second = await claimedTurn(agent, docs, "c2");
  for (const name of names) await edit(first, name, "first turn");
  await first.settle();
  return { agent, second };
}

function checkpoints(agent: AgentStore, turn: Turn) {
  let passes = 0;
  const running = startTurnCheckpoints({
    store: agent.store,
    prefix: PREFIX,
    filesystem: turn.filesystem,
    conversationId: "c2",
    heartbeat: null,
    landed: { add: () => (passes += 1) },
    intervalMs: 20,
  });
  const kick = () => running.observe(toolEnd as never);
  return {
    kick,
    async pass() {
      const before = passes;
      kick();
      await until(() => passes > before);
    },
    stop: () => running.stop(),
  };
}

async function storedCopies(agent: AgentStore) {
  const dir = join(agent.prefixRoot, ...WORKSPACE_REL.split("/"));
  const names = (await readdir(dir)).filter((name) =>
    name.includes("(conflict"),
  );
  const bodies = await Promise.all(
    names.sort().map((name) => readFile(join(dir, name), "utf8")),
  );
  return names.map((name, i) => ({ name, body: bodies[i] }));
}

test("a copy only a checkpoint made is reported by the final pass", async () => {
  const { agent, second } = await staleTurn(["notes.md"]);
  const running = checkpoints(agent, second);
  await edit(second, "notes.md", "draft");
  await running.pass();
  await running.stop();
  const settled = await second.settle();

  const copies = await storedCopies(agent);
  expect(copies).toEqual([{ name: expect.any(String), body: "draft" }]);
  expect(settled.sync?.unsavedFiles?.files).toEqual([
    { path: "notes.md", reason: "conflict_copy", copyPath: copies[0]?.name },
  ]);
});

test("a file edited after its conflict copy keeps one copy, rewritten", async () => {
  const { agent, second } = await staleTurn(["notes.md"]);
  const running = checkpoints(agent, second);
  await edit(second, "notes.md", "draft 1");
  await running.pass();
  await edit(second, "notes.md", "draft 2");
  await running.pass();
  await running.stop();
  await edit(second, "notes.md", "draft 3");
  const settled = await second.settle();

  const copies = await storedCopies(agent);
  expect(copies).toEqual([{ name: expect.any(String), body: "draft 3" }]);
  expect(settled.sync?.unsavedFiles?.files).toEqual([
    { path: "notes.md", reason: "conflict_copy", copyPath: copies[0]?.name },
  ]);
  expect(settled.changed).toContain("FilesChanged");
});

test("a copy from a checkpoint that failed later is the one the final pass reports", async () => {
  const { agent, second } = await staleTurn(["notes.md", "plan.md"]);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  let copyWrites = 0;
  agent.hooks.beforeUpload = (key) =>
    key.includes("(conflict") && ++copyWrites === 2
      ? Promise.reject(new Error("connection reset"))
      : undefined;
  const running = checkpoints(agent, second);
  await edit(second, "notes.md", "turn notes");
  await edit(second, "plan.md", "turn plan");
  running.kick();
  await until(() => copyWrites >= 2);
  await running.stop();
  agent.hooks.beforeUpload = undefined;
  const settled = await second.settle();

  const copies = await storedCopies(agent);
  expect(copies.map(({ body }) => body).sort()).toEqual([
    "turn notes",
    "turn plan",
  ]);
  expect(
    settled.sync?.unsavedFiles?.files.map(({ copyPath }) => copyPath).sort(),
  ).toEqual(copies.map(({ name }) => name));
});

async function freshTurn(names: string[]) {
  const agent = await agentStore();
  for (const name of names)
    await seed(agent.prefixRoot, `${WORKSPACE_REL}/${name}`, "original");
  return { agent, turn: await claimedTurn(agent, podDocs({}), "c2") };
}

async function storedBody(agent: AgentStore, name: string) {
  const dir = join(agent.prefixRoot, ...WORKSPACE_REL.split("/"));
  return readFile(join(dir, name), "utf8");
}

test("a checkpoint that fails after landing a file makes no conflict copy when the turn edits it again", async () => {
  const { agent, turn } = await freshTurn(["notes.md", "plan.md"]);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  // The walk order is the directory's: whichever file goes second fails, so
  // the first one lands without its new generation reaching the manifest.
  let workspaceUploads = 0;
  agent.hooks.beforeUpload = (key) =>
    key.endsWith(".md") && ++workspaceUploads === 2
      ? Promise.reject(new Error("connection reset"))
      : undefined;
  const running = checkpoints(agent, turn);
  await edit(turn, "notes.md", "turn notes");
  await edit(turn, "plan.md", "turn plan");
  running.kick();
  await until(() => workspaceUploads >= 2);
  await running.stop();
  agent.hooks.beforeUpload = undefined;
  await edit(turn, "notes.md", "turn notes 2");
  await edit(turn, "plan.md", "turn plan 2");
  const settled = await turn.settle();

  expect(await storedCopies(agent)).toEqual([]);
  expect(await storedBody(agent, "notes.md")).toBe("turn notes 2");
  expect(await storedBody(agent, "plan.md")).toBe("turn plan 2");
  expect(settled.sync?.unsavedFiles).toBeUndefined();
});

test("a checkpoint upload that landed but lost its response makes no conflict copy", async () => {
  const { agent, turn } = await freshTurn(["notes.md"]);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  let lost = false;
  agent.hooks.afterUpload = (key) => {
    if (!key.endsWith("notes.md") || lost) return;
    lost = true;
    throw new Error("socket hang up");
  };
  const running = checkpoints(agent, turn);
  await edit(turn, "notes.md", "turn notes");
  running.kick();
  await until(() => lost);
  await running.stop();
  await edit(turn, "notes.md", "turn notes 2");
  const settled = await turn.settle();

  expect(await storedCopies(agent)).toEqual([]);
  expect(await storedBody(agent, "notes.md")).toBe("turn notes 2");
  expect(settled.sync?.unsavedFiles).toBeUndefined();
});
