import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  jsonDoc,
  loadLearnings,
  saveActivities,
  saveLearnings,
} from "@houston/domain";
import type { Learning } from "@houston/protocol";
import { expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { LocalPaths } from "../paths";
import { FsVfs, MemoryVfs } from "../vfs";
import { handleAgentData } from "./agent-data";
import { ASSISTANT_AGENT_NAME } from "./assistant";
import {
  ASSISTANT_LEARNINGS_FULL_MESSAGE,
  ASSISTANT_LEARNINGS_MAX_BYTES,
  appendLearningChecked,
} from "./learning-write";

const ROOT = "Personal/Helper";
const ASSISTANT_ROOT = `Personal/${ASSISTANT_AGENT_NAME}`;

test("appendLearningChecked stamps provenance and keeps existing learnings", async () => {
  const vfs = new MemoryVfs();
  await saveLearnings(vfs, ROOT, [
    { id: "old", text: "Existing", created_at: "2020-01-01T00:00:00.000Z" },
  ]);
  await saveActivities(vfs, ROOT, [
    {
      id: "mission-1",
      title: "Renewals",
      description: "",
      status: "running",
      session_key: "conversation-1",
    },
  ]);

  const result = await appendLearningChecked(vfs, ROOT, {
    id: "new",
    text: "  Renewals happen on Mondays.  ",
    nowIso: "2026-08-27T12:00:00.000Z",
    taughtBy: { user_id: "user-1", name: "Ada" },
    conversationId: "conversation-1",
  });

  expect(result).toMatchObject({
    learning: {
      id: "new",
      text: "Renewals happen on Mondays.",
      taught_by: { user_id: "user-1", name: "Ada" },
      mission_id: "mission-1",
      mission_title: "Renewals",
    },
  });
  expect((await loadLearnings(vfs, ROOT)).items.map((item) => item.id)).toEqual(
    ["old", "new"],
  );
});

test("appendLearningChecked deduplicates a retried append by id", async () => {
  const vfs = new MemoryVfs();
  const input = {
    id: "stable",
    text: "Keep this once",
    nowIso: "2026-08-27T12:00:00.000Z",
  };
  await appendLearningChecked(vfs, ROOT, input);
  await appendLearningChecked(vfs, ROOT, input);
  expect((await loadLearnings(vfs, ROOT)).items).toHaveLength(1);
});

test("appendLearningChecked rejects empty text without writing", async () => {
  const vfs = new MemoryVfs();
  expect(
    await appendLearningChecked(vfs, ROOT, {
      id: "new",
      text: "  ",
      nowIso: "2026-08-27T12:00:00.000Z",
    }),
  ).toEqual({ error: "missing 'text'" });
  expect((await loadLearnings(vfs, ROOT)).items).toEqual([]);
});

/**
 * The size cap exists ONLY for the personal assistant, whose whole memory is
 * injected into every system prompt. Every other agent recalls learnings on
 * demand, so its file stays uncapped — byte-identical behavior to an agent that
 * has never heard of the cap.
 */

/** A learnings doc serializing to EXACTLY the cap, so any append goes over. */
function docAtCap(): Learning[] {
  const base: Learning = {
    id: "seed",
    text: "",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  const overhead = Buffer.byteLength(jsonDoc([base]), "utf8");
  return [
    { ...base, text: "x".repeat(ASSISTANT_LEARNINGS_MAX_BYTES - overhead) },
  ];
}

const APPEND = {
  id: "new",
  text: "One more thing to remember",
  nowIso: "2026-08-27T12:00:00.000Z",
};

test("an over-cap append under the assistant root is rejected and writes NOTHING", async () => {
  const vfs = new MemoryVfs();
  const seeded = docAtCap();
  await saveLearnings(vfs, ASSISTANT_ROOT, seeded);

  const result = await appendLearningChecked(vfs, ASSISTANT_ROOT, APPEND);

  expect(result).toEqual({ error: ASSISTANT_LEARNINGS_FULL_MESSAGE });
  expect((await loadLearnings(vfs, ASSISTANT_ROOT)).items).toEqual(seeded);
});

test("the rejection tells the agent to consolidate and to stay quiet about it", async () => {
  // Pinned: this text reaches the model verbatim (route → 400 → save_learning).
  expect(ASSISTANT_LEARNINGS_FULL_MESSAGE).toBe(
    "Your memory is full, so this memory was NOT saved. Consolidate first: read " +
      ".houston/learnings/learnings.json, merge related entries into fewer and " +
      "shorter ones, drop what is stale or repeated, write the trimmed list back " +
      "to that same file, then save this memory again. Never mention files, " +
      "limits, or how your memory works to the user; if you say anything, just " +
      "say you are tidying up what you remember.",
  );
});

test("the identical over-cap append under a normal agent root succeeds", async () => {
  const vfs = new MemoryVfs();
  await saveLearnings(vfs, ROOT, docAtCap());

  const result = await appendLearningChecked(vfs, ROOT, APPEND);

  expect(result).toMatchObject({ learning: { id: "new" } });
  expect((await loadLearnings(vfs, ROOT)).items).toHaveLength(2);
});

test("a first write under an unseeded assistant tree creates the doc (mkdir -p)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "houston-learnwrite-"));
  // The assistant gets NO `.houston` seeding (routes/assistant.ts): its agent
  // directory is bare until the first memory is saved.
  mkdirSync(join(dir, "Personal", ASSISTANT_AGENT_NAME), { recursive: true });
  const vfs = new FsVfs(dir);

  const result = await appendLearningChecked(vfs, ASSISTANT_ROOT, APPEND);

  expect(result).toMatchObject({ learning: { id: "new" } });
  expect(
    existsSync(
      join(
        dir,
        "Personal",
        ASSISTANT_AGENT_NAME,
        ".houston",
        "learnings",
        "learnings.json",
      ),
    ),
  ).toBe(true);
});

/** A fake IncomingMessage: an async byte stream carrying the JSON body. */
function fakeReq(body: unknown): IncomingMessage {
  const buf = Buffer.from(JSON.stringify(body));
  return {
    headers: {},
    async *[Symbol.asyncIterator]() {
      if (buf.byteLength) yield buf;
    },
  } as unknown as IncomingMessage;
}

/** A fake ServerResponse capturing the status `json()` writes. */
function fakeRes() {
  const captured: { status: number } = { status: 0 };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return res;
    },
    end() {},
  } as unknown as ServerResponse;
  return { res, captured };
}

const WORKSPACE: Workspace = {
  id: "Personal",
  ownerUserId: "alice",
  kind: "personal",
  name: "Personal",
  slug: "personal",
  runtime: "local",
  createdAt: 0,
};
// The assistant is SYNTHETIC — `createAgent` refuses a leading dot, so the
// record is built the way discovery addresses it.
const ASSISTANT: Agent = {
  id: ASSISTANT_ROOT,
  workspaceId: WORKSPACE.id,
  name: ASSISTANT_AGENT_NAME,
  createdAt: 0,
};

test("consolidation clears the cap: the doc is replaced, then an append fits again", async () => {
  const vfs = new MemoryVfs();
  await saveLearnings(vfs, ASSISTANT_ROOT, docAtCap());
  expect(await appendLearningChecked(vfs, ASSISTANT_ROOT, APPEND)).toEqual({
    error: ASSISTANT_LEARNINGS_FULL_MESSAGE,
  });

  // What the agent does after reading that message: rewrite the whole doc with
  // a merged, trimmed list. Same whole-file PUT the Memory UI uses, under the
  // same per-doc lock as the append.
  const merged: Learning[] = [
    {
      id: "seed",
      text: "Merged summary",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ];
  const { res, captured } = fakeRes();
  const handled = await handleAgentData(
    vfs,
    new LocalPaths(),
    { workspace: WORKSPACE, agent: ASSISTANT },
    "PUT",
    "learnings",
    fakeReq({ items: merged }),
    res,
  );
  expect([handled, captured.status]).toEqual([true, 200]);

  expect(
    await appendLearningChecked(vfs, ASSISTANT_ROOT, APPEND),
  ).toMatchObject({ learning: { id: "new" } });
  expect(
    (await loadLearnings(vfs, ASSISTANT_ROOT)).items.map((l) => l.id),
  ).toEqual(["seed", "new"]);
});
