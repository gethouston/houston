import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HoustonEvent } from "@houston/protocol";
import { unzipSync, zipSync } from "fflate";
import { afterAll, expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { LocalPaths } from "../paths";
import { FsVfs, MemoryVfs, type Vfs } from "../vfs";
import { handleMigration } from "./migration";
import {
  classifyMigrationPath,
  toolkitsFromIntegrationsJson,
} from "./migration-scope";
import { buildMigrationManifest } from "./migration-source";

/**
 * The one-click desktop→cloud migration surface (HOU-719). Load-bearing
 * behaviors: the shared scope classifier (what leaves the machine — and what
 * must NEVER, like `.houston/integrations.json` or pi session `.jsonl`s), the
 * import allowlist (a hostile zip can't write engine internals), skip-existing
 * idempotency (a re-POST after a dropped connection is a safe resume), and
 * session re-synthesis from imported transcripts.
 */

const ws: Workspace = {
  id: "Personal",
  ownerUserId: "local-owner",
  kind: "personal",
  name: "Personal",
  slug: "personal",
  runtime: "local",
  createdAt: 0,
};
const agent: Agent = {
  id: "Personal/Helper",
  workspaceId: "Personal",
  name: "Helper",
  createdAt: 0,
};
const paths = new LocalPaths();
const ROOT = "Personal/Helper";

function reqOf(body: Buffer, url = "/"): IncomingMessage {
  return {
    url,
    async *[Symbol.asyncIterator]() {
      if (body.byteLength) yield body;
    },
  } as unknown as IncomingMessage;
}

function fakeRes() {
  const captured: { status: number; body: Buffer | null } = {
    status: 0,
    body: null,
  };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return res;
    },
    end(chunk?: Buffer) {
      captured.body = chunk ?? null;
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

async function call(
  vfs: Vfs,
  method: string,
  rest: string,
  body: Buffer | unknown,
  opts: { agentDir?: string; url?: string } = {},
) {
  const events: HoustonEvent[] = [];
  const { res, captured } = fakeRes();
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const handled = await handleMigration(
    { vfs, paths, agentDir: opts.agentDir },
    { workspace: ws, agent },
    method,
    rest,
    reqOf(raw, opts.url ?? "/"),
    res,
    (e) => events.push(e),
  );
  const text = captured.body?.toString("utf8") ?? "";
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null; // binary (zip) response
  }
  return {
    handled,
    status: captured.status,
    bytes: captured.body,
    body: parsed,
    events,
  };
}

// ── scope classifier ────────────────────────────────────────────────────────

test("classifier: core data in, engine internals and secrets out", () => {
  expect(classifyMigrationPath("CLAUDE.md")).toBe("core");
  expect(classifyMigrationPath(".houston/agent.json")).toBe("core");
  expect(classifyMigrationPath(".agents/skills/sum/SKILL.md")).toBe("core");
  expect(classifyMigrationPath(".houston/activity/activity.json")).toBe("core");
  expect(classifyMigrationPath(".houston/runtime/conversations/a.json")).toBe(
    "core",
  );
  expect(classifyMigrationPath("report/q3.pdf")).toBe("file");
  // Never migrated:
  expect(classifyMigrationPath(".houston/integrations.json")).toBeNull();
  expect(classifyMigrationPath(".houston/sessions/anthropic/x.sid")).toBeNull();
  expect(
    classifyMigrationPath(".houston/runtime/sessions/k/1.jsonl"),
  ).toBeNull();
  expect(classifyMigrationPath(".houston/runtime/.migrated")).toBeNull();
  expect(
    classifyMigrationPath(".houston/activity/activity.schema.json"),
  ).toBeNull();
  expect(classifyMigrationPath("AGENTS.md")).toBeNull();
  expect(classifyMigrationPath(".claude/skills/sum/SKILL.md")).toBeNull();
  expect(classifyMigrationPath("notes/.DS_Store")).toBeNull();
});

test("toolkits parse: Rust array shape and map shape, garbage reads empty", () => {
  expect(
    toolkitsFromIntegrationsJson(
      '[{"toolkit":"gmail"},{"toolkit":"slack"},{"toolkit":"gmail"}]',
    ),
  ).toEqual(["gmail", "slack"]);
  expect(toolkitsFromIntegrationsJson('{"gmail":{},"notion":{}}')).toEqual([
    "gmail",
    "notion",
  ]);
  expect(toolkitsFromIntegrationsJson("not json")).toEqual([]);
});

// ── manifest ────────────────────────────────────────────────────────────────

test("manifest lists in-scope entries, reports oversize, reads toolkits", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(`${ROOT}/CLAUDE.md`, "# hi");
  await vfs.writeText(`${ROOT}/notes/todo.txt`, "x");
  await vfs.writeText(`${ROOT}/.houston/sessions/anthropic/a.sid`, "sid");
  await vfs.writeText(
    `${ROOT}/.houston/integrations.json`,
    '[{"toolkit":"gmail"}]',
  );
  await vfs.writeBytes(`${ROOT}/huge.bin`, Buffer.alloc(50 * 1024 * 1024 + 1));
  const m = await buildMigrationManifest(vfs, ROOT);
  expect(m.entries.map((e) => e.path).sort()).toEqual([
    "CLAUDE.md",
    "notes/todo.txt",
  ]);
  expect(m.excluded).toEqual([
    { path: "huge.bin", size: 50 * 1024 * 1024 + 1, reason: "too-large" },
  ]);
  expect(m.integrations).toEqual(["gmail"]);
  expect(m.totalBytes).toBe(5);
});

// ── export ──────────────────────────────────────────────────────────────────

test("export zips exactly the requested in-scope paths", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(`${ROOT}/CLAUDE.md`, "# hi");
  await vfs.writeText(`${ROOT}/notes/todo.txt`, "buy milk");
  const r = await call(vfs, "POST", "migration/export", {
    paths: ["CLAUDE.md", "notes/todo.txt", "gone.txt"],
  });
  expect(r.status).toBe(200);
  const files = unzipSync(new Uint8Array(r.bytes as Buffer));
  expect(Object.keys(files).sort()).toEqual(["CLAUDE.md", "notes/todo.txt"]);
  expect(Buffer.from(files["notes/todo.txt"] as Uint8Array).toString()).toBe(
    "buy milk",
  );
});

test("export refuses an out-of-scope or escaping path with a loud 400", async () => {
  const vfs = new MemoryVfs();
  const traversal = await call(vfs, "POST", "migration/export", {
    paths: ["../etc/passwd"],
  });
  expect(traversal.status).toBe(400);
  const secret = await call(vfs, "POST", "migration/export", {
    paths: [".houston/integrations.json"],
  });
  expect(secret.status).toBe(400);
});

// ── import ──────────────────────────────────────────────────────────────────

function zipOf(entries: Record<string, string>): Buffer {
  const z: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(entries))
    z[k] = new TextEncoder().encode(v);
  return Buffer.from(zipSync(z));
}

test("import writes allowed entries, rejects the rest, emits per-family events", async () => {
  const vfs = new MemoryVfs();
  const r = await call(
    vfs,
    "POST",
    "migration/import",
    zipOf({
      "CLAUDE.md": "# hi",
      ".houston/learnings/learnings.json": "[]",
      "notes/todo.txt": "x",
      ".houston/auth.json": "STOLEN",
      "../escape.txt": "nope",
    }),
  );
  expect(r.status).toBe(200);
  const body = r.body as { written: number; rejected: { path: string }[] };
  expect(body.written).toBe(3);
  expect(body.rejected.map((x) => x.path).sort()).toEqual([
    "../escape.txt",
    ".houston/auth.json",
  ]);
  expect(await vfs.readText(`${ROOT}/.houston/auth.json`)).toBeNull();
  expect(await vfs.readText(`${ROOT}/CLAUDE.md`)).toBe("# hi");
  const types = r.events.map((e) => e.type).sort();
  expect(types).toEqual(["ContextChanged", "FilesChanged", "LearningsChanged"]);
});

test("import skips existing entries (idempotent resume); overwrite=1 replaces", async () => {
  const vfs = new MemoryVfs();
  await vfs.writeText(`${ROOT}/CLAUDE.md`, "original");
  const again = await call(
    vfs,
    "POST",
    "migration/import",
    zipOf({ "CLAUDE.md": "new" }),
  );
  expect((again.body as { skipped: number }).skipped).toBe(1);
  expect(await vfs.readText(`${ROOT}/CLAUDE.md`)).toBe("original");
  const forced = await call(
    vfs,
    "POST",
    "migration/import",
    zipOf({ "CLAUDE.md": "new" }),
    {
      url: "/agents/x/migration/import?overwrite=1",
    },
  );
  expect((forced.body as { written: number }).written).toBe(1);
  expect(await vfs.readText(`${ROOT}/CLAUDE.md`)).toBe("new");
});

test("import rejects a non-zip body with 400", async () => {
  const vfs = new MemoryVfs();
  const r = await call(
    vfs,
    "POST",
    "migration/import",
    Buffer.from("not a zip"),
  );
  expect(r.status).toBe(400);
});

// ── complete / status ───────────────────────────────────────────────────────

test("complete writes the marker; status round-trips it", async () => {
  const vfs = new MemoryVfs();
  const before = await call(vfs, "GET", "migration/status", Buffer.alloc(0));
  expect(before.body).toEqual({ imported: null });
  const done = await call(vfs, "POST", "migration/complete", {
    source: { workspace: "Personal", agent: "Helper" },
    counts: { written: 3 },
  });
  expect(done.status).toBe(200);
  const after = await call(vfs, "GET", "migration/status", Buffer.alloc(0));
  const imported = (
    after.body as { imported: { source: unknown; counts: unknown } }
  ).imported;
  expect(imported.source).toEqual({ workspace: "Personal", agent: "Helper" });
  expect(imported.counts).toEqual({ written: 3 });
});

// ── session re-synthesis (real FS: SessionManager writes .jsonl on disk) ────

const tmp = mkdtempSync(join(tmpdir(), "houston-migration-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

test("imported transcripts re-synthesize pi sessions anchored at agentDir", async () => {
  const vfs = new FsVfs(tmp);
  const agentDir = join(tmp, ROOT);
  const transcript = JSON.stringify({
    id: "activity-1",
    title: "Hello",
    createdAt: 1,
    updatedAt: 2,
    messages: [
      { role: "user", content: "hi", ts: 1 },
      { role: "assistant", content: "hello!", ts: 2 },
    ],
  });
  const r = await call(
    vfs,
    "POST",
    "migration/import",
    zipOf({ ".houston/runtime/conversations/activity-1.json": transcript }),
    { agentDir },
  );
  expect((r.body as { sessionsRebuilt: boolean }).sessionsRebuilt).toBe(true);
  expect(r.events.map((e) => e.type)).toEqual(["ConversationsChanged"]);
  const sessionDir = join(
    agentDir,
    ".houston",
    "runtime",
    "sessions",
    "activity-1",
  );
  expect(existsSync(sessionDir)).toBe(true);
  expect(readdirSync(sessionDir).length).toBeGreaterThan(0);
  // Re-import: transcript skip-existing AND the session dir left untouched.
  const again = await call(
    vfs,
    "POST",
    "migration/import",
    zipOf({ ".houston/runtime/conversations/activity-1.json": transcript }),
    { agentDir },
  );
  expect((again.body as { skipped: number }).skipped).toBe(1);
});
