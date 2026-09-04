import { deepStrictEqual, ok, strictEqual } from "node:assert";
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
  chatCopyPaths,
  copyAgentChats,
  transcriptPath,
} from "../src/lib/copy-agent-chats.ts";

const entry = (session_key: string) =>
  ({ session_key }) as Pick<ConversationEntry, "session_key">;

describe("chatCopyPaths", () => {
  it("carries the board file first, then one transcript per conversation", () => {
    deepStrictEqual(chatCopyPaths([entry("abc"), entry("def")]), [
      ACTIVITY_PATH,
      ".houston/runtime/conversations/abc.json",
      ".houston/runtime/conversations/def.json",
    ]);
  });

  it("collapses duplicate session keys", () => {
    strictEqual(chatCopyPaths([entry("a"), entry("a")]).length, 2);
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
      async migrationImport(agentPath, bytes) {
        const names = Object.keys(unzipSync(new Uint8Array(bytes)));
        imported.push(names);
        calls.push(`import:${agentPath}:${names.length}`);
        const result: MigrationImportResult = {
          written: names.length,
          skipped: 0,
          rejected: names.length === 6 ? [{ path: "x", reason: "r" }] : [],
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
    // 31 paths (board + 30 transcripts) in batches of 25: 25 then 6.
    deepStrictEqual(calls, [
      "list:src",
      "export:src:25",
      "import:dst:25",
      "export:src:6",
      "import:dst:6",
    ]);
    strictEqual(outcome.conversations, 30);
    strictEqual(outcome.written, 31);
    deepStrictEqual(outcome.rejected, [{ path: "x", reason: "r" }]);
    // Nothing lands under a source id: every transcript wears its new key.
    const all = imported.flat();
    ok(all.includes(".houston/runtime/conversations/activity-new0.json"));
    ok(!all.some((rel) => rel.includes("activity-t")));
  });
});
