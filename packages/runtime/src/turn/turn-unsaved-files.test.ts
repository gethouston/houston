import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_UNSAVED_FILES, MAX_UNSAVED_PATH } from "@houston/protocol";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { loadConversation, saveConversation } from "../store/conversation-file";
import { turnTerminalFrame } from "./turn-terminal";
import { turnUnsavedFiles } from "./turn-unsaved-files";
import {
  agentStore,
  claimedTurn,
  podDocs,
  seed,
  WORKSPACE_REL,
} from "./turn-views.test-support";

const W = WORKSPACE_REL;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

test("every un-landed path is reported workspace-relative, internals last", () => {
  const report = turnUnsavedFiles(
    {
      conflicts: [{ key: "data/sessions/c1/x.json" }],
      skipped: [{ key: `${W}/big.zip` }],
      conflictCopies: [
        { key: `${W}/notes.md`, copy: `${W}/notes (conflict D).md` },
      ],
      deletesKept: [{ key: `${W}/old.txt` }],
      outOfScopeKeys: [`${W}/.houston/config/config.json`],
    },
    W,
  );
  expect(report).toEqual({
    files: [
      {
        path: "notes.md",
        reason: "conflict_copy",
        copyPath: "notes (conflict D).md",
      },
      { path: "old.txt", reason: "delete_kept" },
      { path: "big.zip", reason: "too_large" },
      { path: ".houston/config/config.json", reason: "out_of_scope" },
      { path: "data/sessions/c1/x.json", reason: "conflict", internal: true },
    ],
    total: 5,
    counts: {
      conflict_copy: 1,
      conflict: 1,
      delete_kept: 1,
      too_large: 1,
      out_of_scope: 1,
    },
  });
});

test("a path is reported once per reason, with its newest copy", () => {
  const report = turnUnsavedFiles(
    {
      conflicts: [{ key: `${W}/a.md` }, { key: `${W}/a.md` }],
      skipped: [],
      conflictCopies: [
        { key: `${W}/report.md`, copy: `${W}/report (conflict D).md` },
        { key: `${W}/report.md`, copy: `${W}/report (conflict D 2).md` },
      ],
    },
    W,
  );
  expect(report).toEqual({
    files: [
      {
        path: "report.md",
        reason: "conflict_copy",
        copyPath: "report (conflict D 2).md",
      },
      { path: "a.md", reason: "conflict" },
    ],
    total: 2,
    counts: { conflict_copy: 1, conflict: 1 },
  });
});

test("nothing un-landed reports nothing", () => {
  expect(turnUnsavedFiles({ conflicts: [], skipped: [] }, W)).toBeUndefined();
});

test("the report is bounded in entries and path length", () => {
  const long = `${W}/${"d/".repeat(400)}deep.md`;
  const report = turnUnsavedFiles(
    {
      conflicts: Array.from({ length: 30 }, (_, i) => ({ key: `${W}/f${i}` })),
      skipped: [{ key: long }],
    },
    W,
  );
  expect(report?.files).toHaveLength(MAX_UNSAVED_FILES);
  expect(report?.total).toBe(31);
  const bounded = turnUnsavedFiles(
    { conflicts: [], skipped: [{ key: long }] },
    W,
  );
  const path = bounded?.files[0]?.path ?? "";
  expect(path).toHaveLength(MAX_UNSAVED_PATH);
  expect(path.endsWith("deep.md")).toBe(true);
});

test("the terminal frame carries the report", () => {
  const unsavedFiles = turnUnsavedFiles(
    { conflicts: [{ key: `${W}/a.md` }], skipped: [] },
    W,
  );
  const frame = turnTerminalFrame(
    {},
    "t1",
    0,
    undefined,
    undefined,
    [],
    undefined,
    undefined,
    { sync: { board: { landed: false }, unsavedFiles } },
  ) as unknown as { data: Record<string, unknown> };
  expect(frame.data.unsavedFiles).toEqual(unsavedFiles);
});

const NOTES = `${W}/notes.md`;
const COPY = `${W}/notes (conflict 2026-11-22).md`;

async function editNotes(
  turn: Awaited<ReturnType<typeof claimedTurn>>,
  body: string,
) {
  await writeFile(join(turn.filesystem.workspaceDir, "notes.md"), body);
}

function seedReply(turn: Awaited<ReturnType<typeof claimedTurn>>, id: string) {
  const dir = join(turn.filesystem.dataDir, "conversations");
  saveConversation(dir, {
    id,
    title: "t",
    createdAt: 1,
    updatedAt: 1,
    messages: [
      { role: "user", content: "edit", ts: 1, turnId: `turn-${id}` },
      { role: "assistant", content: "done", ts: 2, turnId: `turn-${id}` },
    ],
  });
  return dir;
}

test("overlapping turns keep both versions and the later one says so", async () => {
  const agent = await agentStore();
  await seed(agent.prefixRoot, NOTES, "original");
  const docs = podDocs({});
  const first = await claimedTurn(agent, docs, "c1");
  const second = await claimedTurn(agent, docs, "c2");
  await editNotes(first, "first turn");
  await editNotes(second, "second turn");
  const dir = seedReply(second, "c2");

  await first.settle();
  const settled = await second.settle();

  const stored = (rel: string) =>
    readFile(join(agent.prefixRoot, ...rel.split("/")), "utf8");
  expect(await stored(NOTES)).toBe("first turn");
  expect(await stored(COPY)).toBe("second turn");
  const expected = {
    path: "notes.md",
    reason: "conflict_copy",
    copyPath: "notes (conflict 2026-11-22).md",
  };
  expect(settled.sync?.unsavedFiles?.files).toEqual([expected]);
  const reply = loadConversation(dir, "c2")?.messages.at(-1);
  expect(reply?.unsavedFiles?.files).toEqual([expected]);
  const conversationKey = `${second.filesystem.dataRel}/conversations/c2.json`;
  const remote = JSON.parse(await stored(conversationKey));
  expect(remote.messages.at(-1).unsavedFiles.files).toEqual([expected]);
});

test("the copy fires a file change so the Files tab shows it", async () => {
  const agent = await agentStore();
  await seed(agent.prefixRoot, NOTES, "original");
  const docs = podDocs({});
  const first = await claimedTurn(agent, docs, "c1");
  const second = await claimedTurn(agent, docs, "c2");
  await editNotes(first, "first turn");
  await first.settle();
  const settled = await second.settle();
  expect(settled.changed).not.toContain("FilesChanged");

  const third = await claimedTurn(agent, docs, "c3");
  const fourth = await claimedTurn(agent, docs, "c4");
  await editNotes(third, "third");
  await editNotes(fourth, "fourth");
  await third.settle();
  expect((await fourth.settle()).changed).toContain("FilesChanged");
});

test("the agent's own state keeps the refreshed write, never a copy", async () => {
  const agent = await agentStore();
  const state = `${W}/.houston/state/watermark.json`;
  await seed(agent.prefixRoot, state, "0");
  const docs = podDocs({});
  const first = await claimedTurn(agent, docs, "c1");
  const second = await claimedTurn(agent, docs, "c2");
  const write = (turn: typeof first, body: string) =>
    writeFile(
      join(turn.filesystem.workspaceDir, ".houston/state/watermark.json"),
      body,
    );
  await write(first, "1");
  await write(second, "2");
  await first.settle();
  const settled = await second.settle();
  expect(
    await readFile(join(agent.prefixRoot, ...state.split("/")), "utf8"),
  ).toBe("2");
  expect(settled.sync?.unsavedFiles).toBeUndefined();
});

test("only writes the scope refuses are reported, never the runtime's own scratch", async () => {
  const agent = await agentStore();
  const turn = await claimedTurn(agent, podDocs({}), "c1");
  const config = join(turn.filesystem.workspaceDir, ".houston/config");
  await mkdir(config, { recursive: true });
  await writeFile(join(config, "config.json"), "{}");
  const scratch = join(turn.filesystem.dataDir, "sessions/c1/claude/todos");
  await mkdir(scratch, { recursive: true });
  await writeFile(join(scratch, "t.json"), "[]");
  const settled = await turn.settle();
  expect(settled.sync?.unsavedFiles?.files).toEqual([
    { path: ".houston/config/config.json", reason: "out_of_scope" },
  ]);
});

test("a file the store refused reads as not saved from this reply", () => {
  expect(
    turnUnsavedFiles(
      {
        conflicts: [],
        skipped: [
          { key: `${W}/state.json`, refused: true },
          { key: `${W}/big.zip` },
        ],
        deletesKept: [{ key: `${W}/old.md`, refused: true }],
      },
      W,
    ),
  ).toEqual({
    files: [
      { path: "old.md", reason: "out_of_scope" },
      { path: "state.json", reason: "out_of_scope" },
      { path: "big.zip", reason: "too_large" },
    ],
    total: 3,
    counts: { out_of_scope: 2, too_large: 1 },
  });
});
