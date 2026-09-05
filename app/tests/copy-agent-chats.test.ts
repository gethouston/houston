import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  ConversationEntry,
  MigrationImportResult,
} from "@houston-ai/engine-client";
import { strToU8, unzipSync, zipSync } from "fflate";
import {
  ACTIVITY_PATH,
  batchPaths,
  type ChatCopyEngine,
  chatCopyBatches,
  chatCopyComplete,
  chatCopyPaths,
  copyAgentChats,
  transcriptPath,
  withWakingRetry,
} from "../src/lib/copy-agent-chats.ts";

const entry = (session_key: string) =>
  ({ session_key }) as Pick<ConversationEntry, "session_key">;

describe("chatCopyPaths", () => {
  it("carries one transcript per conversation", () => {
    deepStrictEqual(chatCopyPaths([entry("abc"), entry("def")]), [
      ".houston/runtime/conversations/abc.json",
      ".houston/runtime/conversations/def.json",
    ]);
  });

  it("collapses duplicate session keys", () => {
    strictEqual(chatCopyPaths([entry("a"), entry("a")]).length, 1);
  });

  it("names transcripts the way the runtime does, safely inside the scope", () => {
    // The runtime encodes the id; a key with a slash could otherwise read as
    // a path segment, which the host's export refuses.
    strictEqual(
      transcriptPath("activity/1"),
      ".houston/runtime/conversations/activity%2F1.json",
    );
  });
});

describe("chatCopyBatches", () => {
  it("sends the transcripts first and the board alone, last", () => {
    deepStrictEqual(chatCopyBatches([entry("a"), entry("b"), entry("c")], 2), [
      [
        ".houston/runtime/conversations/a.json",
        ".houston/runtime/conversations/b.json",
      ],
      [".houston/runtime/conversations/c.json"],
      [ACTIVITY_PATH],
    ]);
    // A source with no conversations still ships its (empty) board.
    deepStrictEqual(chatCopyBatches([], 2), [[ACTIVITY_PATH]]);
  });
});

describe("batchPaths", () => {
  it("splits into batches of the given size, last one short", () => {
    deepStrictEqual(batchPaths(["a", "b", "c", "d", "e"], 2), [
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
    deepStrictEqual(batchPaths([], 2), []);
  });
});

describe("copyAgentChats", () => {
  it("exports every batch, re-ids it, and imports it into the target", async () => {
    const calls: string[] = [];
    const imported: string[][] = [];
    const engine: ChatCopyEngine = {
      async listConversations(agentPath) {
        calls.push(`list:${agentPath}`);
        if (agentPath === "dst") return [];
        return Array.from(
          { length: 30 },
          (_, i) =>
            ({
              id: `t${i}`,
              session_key: `activity-t${i}`,
            }) as ConversationEntry,
        );
      },
      async migrationExport(agentPath, paths) {
        calls.push(`export:${agentPath}:${paths.length}`);
        // The archive a host would build for these paths: one entry each.
        const files: Record<string, Uint8Array> = {};
        for (const rel of paths) {
          files[rel] = strToU8(
            rel.endsWith("activity.json")
              ? JSON.stringify([{ id: "t0", title: "T0", status: "done" }])
              : JSON.stringify({ id: rel.slice(rel.lastIndexOf("/") + 1, -5) }),
          );
        }
        const zip = zipSync(files);
        return zip.buffer.slice(
          zip.byteOffset,
          zip.byteOffset + zip.byteLength,
        ) as ArrayBuffer;
      },
      async migrationImport(agentPath, bytes, opts) {
        const names = Object.keys(unzipSync(new Uint8Array(bytes)));
        imported.push(names);
        // Every import asks for NO pi session: the transcripts carry the
        // replay marker instead.
        strictEqual(opts?.sessions, false);
        calls.push(
          `import:${agentPath}:${names.length}${opts?.overwrite ? ":overwrite" : ""}`,
        );
        const result: MigrationImportResult = {
          written: names.length,
          skipped: 0,
          rejected: [],
          sessionsRebuilt: true,
        };
        return result;
      },
    };
    let n = 0;
    const outcome = await copyAgentChats(
      engine,
      "src",
      "dst",
      () => `new${n++}`,
    );
    // 30 transcripts in batches of 10, then the board on its own.
    deepStrictEqual(calls, [
      "list:src",
      "export:src:10",
      "import:dst:10",
      "export:src:10",
      "import:dst:10",
      "export:src:10",
      "import:dst:10",
      "export:src:1",
      "list:dst",
      "import:dst:1:overwrite",
    ]);
    strictEqual(outcome.conversations, 30);
    strictEqual(outcome.transcriptsWritten, 30);
    strictEqual(outcome.boardWritten, true);
    ok(chatCopyComplete(outcome));
    // The board is the LAST thing to land, and nothing lands under a source
    // id: every transcript wears its new key.
    deepStrictEqual(imported[imported.length - 1], [ACTIVITY_PATH]);
    const all = imported.flat();
    ok(all.includes(".houston/runtime/conversations/activity-new0.json"));
    ok(!all.some((rel) => rel.includes("activity-t")));
  });

  it("reports a board the target already had, and rejected files, as incomplete", async () => {
    const engine: ChatCopyEngine = {
      async listConversations(agentPath) {
        // The target already holds a task: the board must not be replaced.
        return [
          {
            id: agentPath === "dst" ? "mine" : "t1",
            session_key: "activity-x",
          } as ConversationEntry,
        ];
      },
      async migrationExport(_agentPath, paths) {
        const files: Record<string, Uint8Array> = {};
        for (const rel of paths)
          files[rel] = strToU8(rel.endsWith("activity.json") ? "[]" : "{}");
        const zip = zipSync(files);
        return zip.buffer.slice(
          zip.byteOffset,
          zip.byteOffset + zip.byteLength,
        ) as ArrayBuffer;
      },
      async migrationImport(_agentPath, bytes, opts) {
        const names = Object.keys(unzipSync(new Uint8Array(bytes)));
        // The board already exists on the target: the importer skips it,
        // and the copy never asked to overwrite it.
        const board = names[0] === ACTIVITY_PATH;
        ok(!opts?.overwrite);
        return {
          written: board ? 0 : 1,
          skipped: board ? 1 : 0,
          rejected: [],
          sessionsRebuilt: true,
        };
      },
    };
    const outcome = await copyAgentChats(engine, "src", "dst", () => "n1");
    strictEqual(outcome.transcriptsWritten, 1);
    strictEqual(outcome.boardWritten, false);
    ok(!chatCopyComplete(outcome));
    ok(
      !chatCopyComplete({
        conversations: 1,
        transcriptsWritten: 1,
        boardWritten: true,
        rejected: [{ path: "x", reason: "too-large" }],
      }),
    );
  });
});

describe("withWakingRetry", () => {
  it("re-runs a leg only for refusals the caller names, then gives up", async () => {
    let calls = 0;
    const waking = new Error("waking");
    const out = await withWakingRetry(
      async () => {
        calls++;
        if (calls < 3) throw waking;
        return "ok";
      },
      (err) => err === waking,
      { attempts: 5, delayMs: 0 },
    );
    strictEqual(out, "ok");
    strictEqual(calls, 3);
    // An unrelated failure is not retried.
    calls = 0;
    await rejects(
      withWakingRetry(
        async () => {
          calls++;
          throw new Error("boom");
        },
        (err) => err === waking,
        { attempts: 5, delayMs: 0 },
      ),
      /boom/,
    );
    strictEqual(calls, 1);
  });
});
