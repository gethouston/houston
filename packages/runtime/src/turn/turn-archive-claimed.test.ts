import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import {
  LocalDirStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { ROUTINE_REPLAY_TAIL } from "../session/routine-replay";
import { segments } from "../store/conversation-archive";
import {
  appendAssistantMessageAt,
  getHistoryAt,
  loadConversation,
} from "../store/conversation-file";
import { startTurnRequestFilesystem } from "./turn-claimed-hydration";
import { syncTurnFilesystem } from "./turn-filesystem";
import {
  loadRoutineReplayArchive,
  routineReplayHistory,
} from "./turn-routine-context";

const PREFIX = "ws/acme/bob";
const AGENT = "workspaces/Personal/Bob";
const CONVERSATIONS = `${AGENT}/.houston/runtime/conversations`;
const SEGMENT_SIZE = 100;
const SEGMENTS = 5;
const CLAIM = {
  id: "claim-1",
  token: "token-1",
  bootId: "boot-1",
  heartbeatUrl: "https://heartbeat.test",
};

const msg = (n: number): ChatMessage => ({
  role: n % 2 ? "assistant" : "user",
  content: `m${n}`,
  ts: n,
});

const archiveOf = (id: string) => `${CONVERSATIONS}/${id}.archive`;

function seed(id: string, live: number) {
  const storeRoot = mkdtempSync(join(tmpdir(), "archive-claimed-"));
  const put = (rel: string, body: unknown) => {
    const file = join(storeRoot, PREFIX, ...rel.split("/"));
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body));
  };
  put(`${AGENT}/CLAUDE.md`, "# Bob\n");
  for (let n = 1; n <= SEGMENTS; n++) {
    const first = (n - 1) * SEGMENT_SIZE;
    put(`${archiveOf(id)}/${n}.json`, {
      id,
      segment: n,
      messages: Array.from({ length: SEGMENT_SIZE }, (_, i) => msg(first + i)),
    });
  }
  const archived = SEGMENTS * SEGMENT_SIZE;
  put(`${CONVERSATIONS}/${id}.json`, {
    id,
    title: "Daily report",
    createdAt: 1,
    updatedAt: 2,
    messages: Array.from({ length: live }, (_, i) => msg(archived + i)),
    archived: {
      messages: archived,
      segments: Array.from({ length: SEGMENTS }, () => SEGMENT_SIZE),
    },
  });
  segments.clear();
  const inner = new LocalDirStore(storeRoot);
  const downloads: string[] = [];
  const store: ObjectStore = {
    list: (p) => inner.list(p),
    manifest: (p) => inner.manifest(p),
    download: (key, dest, opts) => {
      downloads.push(key);
      return inner.download(key, dest, opts);
    },
    upload: (src, key, opts) => inner.upload(src, key, opts),
    delete: (key, opts) => inner.delete(key, opts),
  };
  const remote = (rel: string) =>
    existsSync(join(storeRoot, PREFIX, ...rel.split("/")));
  const segmentDownloads = () =>
    downloads
      .filter((key) => key.includes(".archive/"))
      .map((key) => key.slice(`${PREFIX}/${archiveOf(id)}/`.length));
  return { store, remote, segmentDownloads };
}

async function claimedTurn(id: string, store: ObjectStore) {
  const preparation = await startTurnRequestFilesystem({
    store,
    prefix: PREFIX,
    root: mkdtempSync(join(tmpdir(), "archive-claimed-root-")),
    turn: { conversationId: id, claim: CLAIM },
    timings: {},
  });
  const filesystem = await preparation.hydrated;
  await filesystem.workspaceReady;
  return filesystem;
}

test("a routine fire whose live file holds the replay tail reads no segment from the store", async () => {
  const id = "routine-r1";
  const { store, segmentDownloads } = seed(id, ROUTINE_REPLAY_TAIL + 20);
  const filesystem = await claimedTurn(id, store);
  await loadRoutineReplayArchive(filesystem.loadArchive, id);
  const digest = routineReplayHistory(filesystem.dataDir, id, []);
  expect(segmentDownloads()).toEqual([]);
  expect(digest).toHaveLength(ROUTINE_REPLAY_TAIL);
  expect(digest.at(-1)?.content).toBe(`m${SEGMENTS * SEGMENT_SIZE + 219}`);
});

test("a routine fire with a short live file fetches only the segments its replay tail reaches", async () => {
  const id = "routine-r1";
  const { store, segmentDownloads } = seed(id, 50);
  const filesystem = await claimedTurn(id, store);
  expect(segmentDownloads()).toEqual([]);
  await loadRoutineReplayArchive(filesystem.loadArchive, id);
  expect(segmentDownloads()).toEqual(["4.json", "5.json"]);
  const digest = routineReplayHistory(filesystem.dataDir, id, []);
  expect(digest).toHaveLength(ROUTINE_REPLAY_TAIL);
  expect(digest[0]?.content).toBe("m350");
  expect(digest.at(-1)?.content).toBe("m549");
});

test("a send in a rotated chat hydrates no segment, and a full recall fetches them all", async () => {
  const id = "c1";
  const { store, segmentDownloads } = seed(id, 50);
  const filesystem = await claimedTurn(id, store);
  await loadRoutineReplayArchive(filesystem.loadArchive, id);
  expect(segmentDownloads()).toEqual([]);
  await filesystem.loadArchive?.(id, {});
  expect(segmentDownloads().toSorted()).toEqual(
    ["1.json", "2.json", "3.json", "4.json", "5.json"].toSorted(),
  );
  expect(
    getHistoryAt(join(filesystem.dataDir, "conversations"), id)?.messages,
  ).toHaveLength(SEGMENTS * SEGMENT_SIZE + 50);
});

test("a rotation on the worker with no segment on disk uploads the new one and deletes nothing remote", async () => {
  const id = "routine-r1";
  const { store, remote, segmentDownloads } = seed(id, 50);
  const filesystem = await claimedTurn(id, store);
  const conversations = join(filesystem.dataDir, "conversations");
  appendAssistantMessageAt(conversations, id, "Report: nothing new.", {
    tools: [{ name: "Read", result: "row;".repeat(2_300_000) }],
  });
  expect(loadConversation(conversations, id)?.archived?.segments).toHaveLength(
    SEGMENTS + 1,
  );
  const result = await syncTurnFilesystem({
    store,
    prefix: PREFIX,
    filesystem,
    conversationId: id,
    claimed: true,
  });
  expect(segmentDownloads()).toEqual([]);
  expect(result.deleted).toEqual([]);
  expect(result.uploaded).toContain(`${archiveOf(id)}/${SEGMENTS + 1}.json`);
  for (let n = 1; n <= SEGMENTS + 1; n++)
    expect(remote(`${archiveOf(id)}/${n}.json`)).toBe(true);
});
