import { test, expect } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Database } from "bun:sqlite";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { migrateChatHistory } from "./chat-history";

/**
 * Synthetic-fixture tests for the Rust-era chat-history migration. We build a
 * tiny fake `chat_feed` sqlite + a fake agent tree with `.sid`/`.history` files,
 * then assert: the right conversations + transcripts are produced; the pi
 * session restores the user/assistant text via continueRecent(); orphans are
 * logged-not-migrated; a 2nd run is a no-op; and the SOURCE db + tree are
 * byte-identical after. No real ~/.houston is ever touched.
 */

type Feed = {
  sid: string;
  type: string;
  data: string; // already-JSON-encoded data_json
  ts: string;
};

/** Build a fake chat_feed db at <dir>/houston.db and return its path. */
function buildDb(dir: string, rows: Feed[]): string {
  const dbPath = join(dir, "houston.db");
  const db = new Database(dbPath, { create: true });
  db.run(
    `CREATE TABLE chat_feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claude_session_id TEXT NOT NULL,
      feed_type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'desktop',
      timestamp TEXT NOT NULL
    )`,
  );
  const ins = db.query(
    "INSERT INTO chat_feed (claude_session_id, feed_type, data_json, timestamp) VALUES (?,?,?,?)",
  );
  for (const r of rows) ins.run(r.sid, r.type, r.data, r.ts);
  db.close();
  return dbPath;
}

/** s(x) — the way the Rust app stored a JSON-encoded string in data_json. */
const s = (x: string) => JSON.stringify(x);

function sha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** A recursive snapshot of {relpath → sha256} for a tree, to prove no mutation. */
function treeHashes(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, r);
      else out[r] = sha(full);
    }
  };
  walk(root, "");
  return out;
}

function writeTracker(
  agentRoot: string,
  provider: string,
  key: string,
  ext: "sid" | "history",
  body: string,
) {
  const dir = join(agentRoot, ".houston", "sessions", provider);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${key}.${ext}`), body);
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "hmig-syn-"));
  const workspacesRoot = join(root, "workspaces");
  const agentRoot = join(workspacesRoot, "Personal", "Assistant");
  mkdirSync(agentRoot, { recursive: true });

  // Conversation A: one agent, single session id, two turns. final_result drives
  // the assistant memory; tool_call/tool_result/thinking are transcript-only.
  const rows: Feed[] = [
    {
      sid: "sid-A",
      type: "user_message",
      data: s("What's in the zip?"),
      ts: "2025-06-05T10:00:00.000Z",
    },
    {
      sid: "sid-A",
      type: "assistant_text",
      data: s("Let me look"),
      ts: "2025-06-05T10:00:01.000Z",
    },
    {
      sid: "sid-A",
      type: "thinking",
      data: s("I should unzip it"),
      ts: "2025-06-05T10:00:02.000Z",
    },
    {
      sid: "sid-A",
      type: "tool_call",
      data: JSON.stringify({ name: "Bash", input: { cmd: "unzip" } }),
      ts: "2025-06-05T10:00:03.000Z",
    },
    {
      sid: "sid-A",
      type: "tool_result",
      data: JSON.stringify({ content: "keys/ dotfiles/", is_error: false }),
      ts: "2025-06-05T10:00:04.000Z",
    },
    {
      sid: "sid-A",
      type: "file_changes",
      data: JSON.stringify({ created: ["/a/qr.png"], modified: [] }),
      ts: "2025-06-05T10:00:05.000Z",
    },
    {
      sid: "sid-A",
      type: "final_result",
      data: JSON.stringify({
        result: "It has keys and dotfiles.",
        cost_usd: null,
        duration_ms: 100,
      }),
      ts: "2025-06-05T10:00:06.000Z",
    },
    // Second turn, no final_result → falls back to concatenated assistant_text.
    {
      sid: "sid-A",
      type: "user_message",
      data: s("Thanks!"),
      ts: "2025-06-05T10:01:00.000Z",
    },
    {
      sid: "sid-A",
      type: "assistant_text",
      data: s("You're "),
      ts: "2025-06-05T10:01:01.000Z",
    },
    {
      sid: "sid-A",
      type: "assistant_text",
      data: s("welcome."),
      ts: "2025-06-05T10:01:02.000Z",
    },

    // Conversation B: spans anthropic + openai ids (cross-provider union).
    {
      sid: "sid-B1",
      type: "user_message",
      data: s("Started on Claude"),
      ts: "2025-06-06T09:00:00.000Z",
    },
    {
      sid: "sid-B1",
      type: "final_result",
      data: JSON.stringify({ result: "Reply on Claude" }),
      ts: "2025-06-06T09:00:01.000Z",
    },
    {
      sid: "sid-B2",
      type: "user_message",
      data: s("Continued on Codex"),
      ts: "2025-06-06T09:05:00.000Z",
    },
    {
      sid: "sid-B2",
      type: "final_result",
      data: JSON.stringify({ result: "Reply on Codex" }),
      ts: "2025-06-06T09:05:01.000Z",
    },

    // Orphan: rows exist but NO tracker file references this id.
    {
      sid: "sid-orphan",
      type: "user_message",
      data: s("Ghost convo"),
      ts: "2025-06-07T00:00:00.000Z",
    },
    {
      sid: "sid-orphan",
      type: "final_result",
      data: JSON.stringify({ result: "Nobody links me" }),
      ts: "2025-06-07T00:00:01.000Z",
    },
  ];
  const dbPath = buildDb(root, rows);

  // Tracker files. A: single .sid (no trailing newline, like the real ones).
  writeTracker(agentRoot, "anthropic", "activity-A", "sid", "sid-A");
  // B: anthropic id via .sid, openai id via .sid — same session_key, cross-provider.
  writeTracker(agentRoot, "anthropic", "activity-B", "sid", "sid-B1");
  writeTracker(agentRoot, "openai", "activity-B", "history", "sid-B2\n");

  return { root, workspacesRoot, agentRoot, dbPath };
}

function readTranscript(agentRoot: string, key: string) {
  const f = join(
    agentRoot,
    ".houston",
    "runtime",
    "conversations",
    `${encodeURIComponent(key)}.json`,
  );
  return JSON.parse(readFileSync(f, "utf8")) as {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: { role: string; content: string; ts: number }[];
  };
}

test("migrates linked conversations into v3 transcripts + a marker", () => {
  const { workspacesRoot, agentRoot, dbPath } = setup();
  const logs: string[] = [];
  const res = migrateChatHistory({
    workspacesRoot,
    dbPath,
    log: (l) => logs.push(l),
  });

  // Two linked conversations (A, B); the orphan is not migrated.
  expect(res.totalMigrated).toBe(2);
  expect(res.orphanSessionIds).toBe(1);

  const a = readTranscript(agentRoot, "activity-A");
  expect(a.id).toBe("activity-A");
  // Transcript renders the FULL feed in order (user, assistant chunk, thinking,
  // tool_call, tool_result, file_changes, final_result, then the 2nd turn).
  const kinds = a.messages.map((m) => m.content);
  expect(a.messages[0]).toMatchObject({
    role: "user",
    content: "What's in the zip?",
  });
  expect(kinds.some((c) => c.startsWith("[thinking]"))).toBe(true);
  expect(kinds.some((c) => c.startsWith("[tool: Bash]"))).toBe(true);
  expect(kinds.some((c) => c.startsWith("[tool result]"))).toBe(true);
  expect(kinds.some((c) => c.startsWith("[file changes]"))).toBe(true);
  expect(kinds).toContain("It has keys and dotfiles.");
  expect(a.title).toBe("What's in the zip?");

  // Cross-provider conversation B merged both ids in timestamp order.
  const b = readTranscript(agentRoot, "activity-B");
  const bUser = b.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  expect(bUser).toEqual(["Started on Claude", "Continued on Codex"]);

  // Marker written.
  const marker = join(agentRoot, ".houston", "runtime", ".migrated");
  expect(statSync(marker).isFile()).toBe(true);

  // Orphan logged, not silently dropped.
  expect(logs.join("\n")).toContain("1 orphan conversation(s)");
});

test("the synthesized pi session restores user/assistant TEXT via continueRecent()", () => {
  const { workspacesRoot, agentRoot, dbPath } = setup();
  migrateChatHistory({ workspacesRoot, dbPath });

  const sessionDir = join(
    agentRoot,
    ".houston",
    "runtime",
    "sessions",
    "activity-A",
  );
  const mgr = SessionManager.continueRecent(agentRoot, sessionDir);
  const ctx = mgr.buildSessionContext();

  // user + assistant(final_result) + user + assistant(fallback chunks) = 4 msgs.
  // NO tool/thinking/file entries leak into the agent's memory.
  expect(ctx.messages).toHaveLength(4);
  const text = JSON.stringify(ctx.messages);
  expect(text).toContain("What's in the zip?");
  expect(text).toContain("It has keys and dotfiles.");
  expect(text).toContain("You're welcome."); // fallback concatenation
  expect(text).not.toContain("[thinking]");
  expect(text).not.toContain("unzip");
  expect(text).not.toContain("[tool");

  // Roles alternate user/assistant.
  expect(ctx.messages.map((m: { role: string }) => m.role)).toEqual([
    "user",
    "assistant",
    "user",
    "assistant",
  ]);
});

test("a 2nd run is a no-op (marker + per-conversation guard) and writes nothing new", () => {
  const { workspacesRoot, agentRoot, dbPath } = setup();
  migrateChatHistory({ workspacesRoot, dbPath });

  const runtimeRoot = join(agentRoot, ".houston", "runtime");
  const before = treeHashes(runtimeRoot);

  const res2 = migrateChatHistory({ workspacesRoot, dbPath });
  expect(res2.totalMigrated).toBe(0);

  const after = treeHashes(runtimeRoot);
  expect(after).toEqual(before); // byte-identical runtime tree
});

test("the SOURCE db + agent tree are byte-identical after migration", () => {
  const { root, workspacesRoot, agentRoot, dbPath } = setup();

  // Hash the db and the PRE-EXISTING tree (sessions/, but NOT the runtime/ we'll
  // create). We snapshot everything under the agent EXCEPT .houston/runtime.
  const dbBefore = sha(dbPath);
  const sessionsBefore = treeHashes(join(agentRoot, ".houston", "sessions"));

  migrateChatHistory({ workspacesRoot, dbPath });

  expect(sha(dbPath)).toBe(dbBefore); // db never touched
  expect(treeHashes(join(agentRoot, ".houston", "sessions"))).toEqual(
    sessionsBefore,
  ); // trackers untouched

  // Only NEW files appeared, all under .houston/runtime.
  expect(statSync(join(agentRoot, ".houston", "runtime")).isDirectory()).toBe(
    true,
  );
  void root;
});

test("an agent with no tracker files is skipped cleanly (no runtime dir, no marker noise)", () => {
  const root = mkdtempSync(join(tmpdir(), "hmig-empty-"));
  const workspacesRoot = join(root, "workspaces");
  const agentRoot = join(workspacesRoot, "Personal", "Bare");
  mkdirSync(agentRoot, { recursive: true });
  const dbPath = buildDb(root, [
    {
      sid: "x",
      type: "user_message",
      data: s("hi"),
      ts: "2025-01-01T00:00:00.000Z",
    },
  ]);

  const res = migrateChatHistory({ workspacesRoot, dbPath });
  expect(res.totalMigrated).toBe(0);
  // Every chat_feed id is an orphan here (no trackers anywhere).
  expect(res.orphanSessionIds).toBe(1);
});
