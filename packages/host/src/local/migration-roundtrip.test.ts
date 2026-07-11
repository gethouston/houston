import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { RuntimeSpawner } from "../launcher/process";
import { Database } from "../migrate/sqlite";
import { buildLocalHost } from "./host";

/**
 * The one-click desktop→cloud migration, end to end over real HTTP (HOU-719):
 * a SOURCE host boots passively against a Rust-era tree (flat `.houston`
 * layout, markdown learnings, a `chat_feed` sqlite + `.sid` tracker) — its
 * boot migrations convert everything in place — then the wizard's exact call
 * sequence runs: source listing → export → create on the TARGET host → import
 * → complete. The target ends up with the agent's instructions, converted
 * learnings, the chat transcript, a re-synthesized pi session, and the marker;
 * the toolkit list rides the manifest while `.houston/integrations.json`
 * itself never crosses.
 */

const fakeSpawner: RuntimeSpawner = {
  spawn: () => ({ port: 0, kill: () => {} }),
};

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

async function bootHost(opts: {
  workspacesRoot: string;
  passive?: boolean;
  chatHistoryDbPath?: string;
}) {
  const port = await freePort();
  const host = buildLocalHost({
    workspacesRoot: opts.workspacesRoot,
    credentialsPath: join(
      mkdtempSync(join(tmpdir(), "houston-mig-cred-")),
      "credentials.json",
    ),
    port,
    token: "boot-secret",
    runtimeCommand: ["true"],
    spawner: fakeSpawner,
    passive: opts.passive,
    chatHistoryDbPath: opts.chatHistoryDbPath,
  });
  await host.start();
  return { host, base: `http://127.0.0.1:${port}` };
}

const auth = { Authorization: "Bearer boot-secret" };
const jsonAuth = { ...auth, "Content-Type": "application/json" };

/** A Rust-era source tree: flat layout + md learnings + chat db + tracker. */
function buildSourceTree() {
  const root = mkdtempSync(join(tmpdir(), "houston-mig-src-"));
  const workspacesRoot = join(root, "workspaces");
  const agentRoot = join(workspacesRoot, "Work", "Sales");
  mkdirSync(join(agentRoot, ".houston"), { recursive: true });
  writeFileSync(join(agentRoot, "CLAUDE.md"), "# Sales agent");
  mkdirSync(join(agentRoot, ".agents", "skills", "crm"), { recursive: true });
  writeFileSync(
    join(agentRoot, ".agents", "skills", "crm", "SKILL.md"),
    "---\nname: crm\n---\n",
  );
  writeFileSync(join(agentRoot, ".houston", "activity.json"), "[]"); // flat era
  mkdirSync(join(agentRoot, ".houston", "memory"), { recursive: true });
  writeFileSync(
    join(agentRoot, ".houston", "memory", "learnings.md"),
    "- Always CC the manager\n",
  );
  writeFileSync(
    join(agentRoot, ".houston", "integrations.json"),
    '[{"toolkit":"gmail"}]',
  );
  const trackerDir = join(agentRoot, ".houston", "sessions", "anthropic");
  mkdirSync(trackerDir, { recursive: true });
  writeFileSync(join(trackerDir, "activity-1.sid"), "sid-A");

  const dbDir = join(root, "db");
  mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "houston.db");
  const db = new Database(dbPath, { create: true });
  db.run(
    `CREATE TABLE chat_feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claude_session_id TEXT NOT NULL,
      feed_type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )`,
  );
  const ins = db.query(
    "INSERT INTO chat_feed (claude_session_id, feed_type, data_json, timestamp) VALUES (?,?,?,?)",
  );
  ins.run("sid-A", "user_message", '"Ping the lead"', "2025-06-05T10:00:00Z");
  ins.run("sid-A", "assistant_text", '"Pinged."', "2025-06-05T10:00:01Z");
  db.close();
  return { workspacesRoot, dbPath };
}

test("source→target round trip: convert on boot, export, import, resume marker", async () => {
  const src = buildSourceTree();
  const source = await bootHost({
    workspacesRoot: src.workspacesRoot,
    passive: true,
    chatHistoryDbPath: src.dbPath,
  });
  const targetRoot = mkdtempSync(join(tmpdir(), "houston-mig-dst-"));
  const target = await bootHost({ workspacesRoot: targetRoot });
  try {
    // Source listing: boot migrations already converted the tree.
    const listing = (await (
      await fetch(`${source.base}/v1/migration/source`, { headers: auth })
    ).json()) as {
      agents: {
        id: string;
        manifest: { entries: { path: string }[]; integrations: string[] };
      }[];
    };
    expect(listing.agents.map((a) => a.id)).toEqual(["Work/Sales"]);
    const manifest = listing.agents[0]?.manifest;
    const paths = manifest?.entries.map((e) => e.path) ?? [];
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".houston/learnings/learnings.json"); // md → json on boot
    expect(paths).toContain(".houston/runtime/conversations/activity-1.json"); // db → transcript on boot
    expect(paths.some((p) => p.startsWith(".houston/sessions/"))).toBe(false);
    expect(paths).not.toContain(".houston/integrations.json");
    expect(manifest?.integrations).toEqual(["gmail"]);

    // Export the whole manifest as one chunk.
    const exported = await fetch(
      `${source.base}/agents/${encodeURIComponent("Work/Sales")}/migration/export`,
      { method: "POST", headers: jsonAuth, body: JSON.stringify({ paths }) },
    );
    expect(exported.status).toBe(200);
    const zip = Buffer.from(await exported.arrayBuffer());

    // Create the target agent, import, complete.
    const created = (await (
      await fetch(`${target.base}/agents`, {
        method: "POST",
        headers: jsonAuth,
        body: JSON.stringify({ name: "Sales" }),
      })
    ).json()) as { id: string };
    const agentUrl = `${target.base}/agents/${encodeURIComponent(created.id)}`;
    const imported = (await (
      await fetch(`${agentUrl}/migration/import`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/zip" },
        body: new Uint8Array(zip),
      })
    ).json()) as {
      written: number;
      rejected: unknown[];
      sessionsRebuilt: boolean;
    };
    expect(imported.rejected).toEqual([]);
    expect(imported.written).toBeGreaterThanOrEqual(4);
    expect(imported.sessionsRebuilt).toBe(true);

    const targetAgentDir = join(targetRoot, ...created.id.split("/"));
    expect(existsSync(join(targetAgentDir, "CLAUDE.md"))).toBe(true);
    expect(
      existsSync(
        join(targetAgentDir, ".houston", "learnings", "learnings.json"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          targetAgentDir,
          ".houston",
          "runtime",
          "conversations",
          "activity-1.json",
        ),
      ),
    ).toBe(true);
    // The pi session was re-synthesized on the TARGET (not copied).
    expect(
      existsSync(
        join(targetAgentDir, ".houston", "runtime", "sessions", "activity-1"),
      ),
    ).toBe(true);

    // Completion marker round-trips for resume.
    await fetch(`${agentUrl}/migration/complete`, {
      method: "POST",
      headers: jsonAuth,
      body: JSON.stringify({ source: { agent: "Work/Sales" } }),
    });
    const status = (await (
      await fetch(`${agentUrl}/migration/status`, { headers: auth })
    ).json()) as { imported: { source: { agent: string } } };
    expect(status.imported.source.agent).toBe("Work/Sales");
  } finally {
    source.host.stop();
    target.host.stop();
  }
});
