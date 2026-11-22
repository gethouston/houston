import { readFile, writeFile } from "node:fs/promises";
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
      outOfScope: 7,
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
    total: 11,
    counts: {
      conflict_copy: 1,
      conflict: 1,
      delete_kept: 1,
      too_large: 1,
      out_of_scope: 7,
    },
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
