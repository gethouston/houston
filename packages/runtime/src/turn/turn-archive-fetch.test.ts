import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import {
  type HydrateManifest,
  LocalDirStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { expect, test, vi } from "vitest";
import { segments } from "../store/conversation-archive";
import { ArchiveSegmentMissingError } from "../store/conversation-archive-missing";
import { getHistoryAt } from "../store/conversation-file";
import { turnArchiveLoader } from "./turn-archive-fetch";
import { loadRoutineReplayArchive } from "./turn-routine-context";

const PREFIX = "ws/acme/bob";
const DATA = "workspaces/Personal/Bob/.houston/runtime";
const ARCHIVE = `${DATA}/conversations/routine-r1.archive`;

const msg = (n: number): ChatMessage => ({
  role: n % 2 ? "assistant" : "user",
  content: `m${n}`,
  ts: n,
});

/** The store holds 4 segments of 3 messages and a 2-message tail; the turn's
 *  tree hydrated the tail and the two newest segments only. */
function fixture() {
  const storeRoot = mkdtempSync(join(tmpdir(), "archive-store-"));
  const agent = join(storeRoot, ...PREFIX.split("/"));
  mkdirSync(join(agent, ...ARCHIVE.split("/")), { recursive: true });
  for (const n of [1, 2, 3, 4]) {
    const first = (n - 1) * 3;
    writeFileSync(
      join(agent, ...ARCHIVE.split("/"), `${n}.json`),
      JSON.stringify({
        id: "routine-r1",
        segment: n,
        messages: [first, first + 1, first + 2].map(msg),
      }),
    );
  }
  writeFileSync(
    join(agent, ...DATA.split("/"), "conversations", "routine-r1.json"),
    JSON.stringify({
      id: "routine-r1",
      title: "Daily report",
      createdAt: 1,
      updatedAt: 2,
      messages: [12, 13].map(msg),
      archived: { messages: 12, segments: [3, 3, 3, 3] },
    }),
  );
  const tree = mkdtempSync(join(tmpdir(), "archive-tree-"));
  cpSync(agent, tree, { recursive: true });
  for (const n of [1, 2])
    rmSync(join(tree, ...ARCHIVE.split("/"), `${n}.json`));
  segments.clear();
  const reads: string[] = [];
  const inner = new LocalDirStore(storeRoot);
  const store: ObjectStore = {
    list: (p) => inner.list(p),
    manifest: (p) => {
      reads.push(`manifest ${p}`);
      return inner.manifest(p);
    },
    download: (key, dest, opts) => {
      reads.push(key);
      return inner.download(key, dest, opts);
    },
    upload: (src, key, opts) => inner.upload(src, key, opts),
    delete: (key, opts) => inner.delete(key, opts),
  };
  const manifest: HydrateManifest = new Map();
  const load = turnArchiveLoader({
    store,
    prefix: PREFIX,
    storeRoot: tree,
    dataRel: DATA,
    manifest,
    maxBytes: 1024 * 1024,
  });
  const conversations = join(tree, ...DATA.split("/"), "conversations");
  return { storeRoot, agent, tree, reads, manifest, load, conversations };
}

test("a window inside the hydrated segments touches the store not at all", async () => {
  const { load, reads, conversations } = fixture();
  await load("routine-r1", { limit: 8 });
  expect(reads).toEqual([]);
  expect(getHistoryAt(conversations, "routine-r1", { limit: 8 })?.offset).toBe(
    6,
  );
});

test("a reader reaching back fetches exactly the missing segments, owned by the sync", async () => {
  const { load, reads, manifest, conversations } = fixture();
  await load("routine-r1", { limit: 10 });
  expect(reads).toEqual([
    `manifest ${PREFIX}/${ARCHIVE}`,
    `${PREFIX}/${ARCHIVE}/2.json`,
  ]);
  // In the manifest with its hash: unchanged, so the sync never re-uploads
  // it, and owned, so a later local delete (edit-and-resend) reaches the store.
  expect(manifest.get(`${ARCHIVE}/2.json`)?.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(manifest.has(`${ARCHIVE}/1.json`)).toBe(false);
  await load("routine-r1", {});
  expect(
    getHistoryAt(conversations, "routine-r1")?.messages.map((m) => m.content),
  ).toEqual(Array.from({ length: 14 }, (_, n) => `m${n}`));
});

test("a segment the store lost fails the fetch loudly, reported once", async () => {
  const { load, agent, conversations } = fixture();
  rmSync(join(agent, ...ARCHIVE.split("/"), "1.json"));
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(load("routine-r1", {})).rejects.toBeInstanceOf(
      ArchiveSegmentMissingError,
    );
    // A reader that goes on anyway sees the gap, already reported.
    expect(getHistoryAt(conversations, "routine-r1")?.messages).toHaveLength(
      11,
    );
    expect(errors).toHaveBeenCalledTimes(1);
  } finally {
    errors.mockRestore();
  }
});

test("a routine digest reads past a segment the store lost; any other failure fails the turn", async () => {
  const { load, agent } = fixture();
  rmSync(join(agent, ...ARCHIVE.split("/"), "1.json"));
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(
      loadRoutineReplayArchive(load, "routine-r1"),
    ).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledTimes(1);
  } finally {
    errors.mockRestore();
  }
  const down = new Error("store unreachable");
  await expect(
    loadRoutineReplayArchive(() => Promise.reject(down), "routine-r1"),
  ).rejects.toBe(down);
});

test("a chat with no archive, or no live file, needs nothing", async () => {
  const { load, reads } = fixture();
  await load("c-unknown", {});
  expect(reads).toEqual([]);
});
