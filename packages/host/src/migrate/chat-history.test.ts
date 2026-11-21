import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { migrateChatHistory } from "./chat-history";
import { Database } from "./sqlite";

type Feed = {
  sid: string;
  type: string;
  data: string;
  ts: string;
};

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

const s = (x: string) => JSON.stringify(x);

function sha(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

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

  writeTracker(agentRoot, "anthropic", "activity-A", "sid", "sid-A");
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

test("migrates linked conversations into v3 transcripts", () => {
  const { workspacesRoot, agentRoot, dbPath } = setup();
  const logs: string[] = [];
  const res = migrateChatHistory({
    workspacesRoot,
    dbPath,
    log: (l) => logs.push(l),
  });

  expect(res.totalMigrated).toBe(2);
  expect(res.orphanSessionIds).toBe(1);

  const a = readTranscript(agentRoot, "activity-A");
  expect(a.id).toBe("activity-A");
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

  const b = readTranscript(agentRoot, "activity-B");
  const bUser = b.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  expect(bUser).toEqual(["Started on Claude", "Continued on Codex"]);

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

  expect(ctx.messages).toHaveLength(5);
  const text = JSON.stringify(ctx.messages);
  expect(text).toContain("What's in the zip?");
  expect(text).toContain("It has keys and dotfiles.");
  expect(text).toContain("You're welcome.");
  expect(text).not.toContain("[thinking]");
  expect(text).not.toContain("unzip");
  expect(text).not.toContain("[tool");

  const last = ctx.messages[ctx.messages.length - 1] as {
    role: string;
    content: string;
  };
  expect(last.role).toBe("user");
  expect(last.content).toContain("[Imported history]");

  expect(ctx.messages.map((m: { role: string }) => m.role)).toEqual([
    "user",
    "assistant",
    "user",
    "assistant",
    "user",
  ]);
});

test("a 2nd run is a no-op (per-conversation guard) and writes nothing new", () => {
  const { workspacesRoot, agentRoot, dbPath } = setup();
  migrateChatHistory({ workspacesRoot, dbPath });

  const runtimeRoot = join(agentRoot, ".houston", "runtime");
  const before = treeHashes(runtimeRoot);

  const res2 = migrateChatHistory({ workspacesRoot, dbPath });
  expect(res2.totalMigrated).toBe(0);

  const after = treeHashes(runtimeRoot);
  expect(after).toEqual(before);
});

test("chats written AFTER an earlier run still migrate on the next boot", () => {
  const { workspacesRoot, agentRoot, dbPath } = setup();
  migrateChatHistory({ workspacesRoot, dbPath });

  writeFileSync(
    join(agentRoot, ".houston", "runtime", ".migrated"),
    "2026-06-26T00:00:00.000Z",
  );

  writeTracker(agentRoot, "anthropic", "activity-LATE", "sid", "sid-LATE");
  const db = new Database(dbPath, {});
  const ins = db.query(
    "INSERT INTO chat_feed (claude_session_id, feed_type, data_json, timestamp) VALUES (?,?,?,?)",
  );
  ins.run(
    "sid-LATE",
    "user_message",
    s("Late chat"),
    "2025-07-01T10:00:00.000Z",
  );
  ins.run(
    "sid-LATE",
    "final_result",
    JSON.stringify({ result: "Late reply" }),
    "2025-07-01T10:00:01.000Z",
  );
  db.close();

  const res = migrateChatHistory({ workspacesRoot, dbPath });
  expect(res.totalMigrated).toBe(1);
  expect(res.totalSkipped).toBe(2);

  const late = readTranscript(agentRoot, "activity-LATE");
  expect(late.messages.map((m) => m.content)).toEqual([
    "Late chat",
    "Late reply",
  ]);
});

test("the SOURCE db + agent tree are byte-identical after migration", () => {
  const { root, workspacesRoot, agentRoot, dbPath } = setup();

  const dbBefore = sha(dbPath);
  const sessionsBefore = treeHashes(join(agentRoot, ".houston", "sessions"));

  migrateChatHistory({ workspacesRoot, dbPath });

  expect(sha(dbPath)).toBe(dbBefore);
  expect(treeHashes(join(agentRoot, ".houston", "sessions"))).toEqual(
    sessionsBefore,
  );

  expect(statSync(join(agentRoot, ".houston", "runtime")).isDirectory()).toBe(
    true,
  );
  void root;
});

test("an agent with no tracker files is skipped cleanly (nothing written)", () => {
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
  expect(res.orphanSessionIds).toBe(1);
});
