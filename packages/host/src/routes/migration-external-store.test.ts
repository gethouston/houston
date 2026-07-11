import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { zipSync } from "fflate";
import { afterEach, expect, test } from "vitest";
import { StoreSyncDaemon } from "../store-sync";
import { FsVfs } from "../vfs";
import { applyMigrationArchive } from "./migration-import";

/**
 * External-store (GCS) compatibility guard for the desktop→cloud migration
 * (HOU-719). Managed pods run with `HOUSTON_STORE_URL` set: `/data` is an
 * ephemeral emptyDir the engine hydrates from the object store on boot and
 * syncs back on write — there is NO PersistentVolume. This test proves the
 * migration import route is durable under that model: everything it writes
 * (imported files, the re-synthesized pi session, the completion marker) lands
 * under the store-sync root, survives the flush to the store, and is recovered
 * by a fresh pod that only hydrates from the store. A regression here would
 * silently lose migrated data the first time a pod recycles.
 */

const cleanups: string[] = [];
function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of cleanups.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

const ROOT = "workspaces/Personal/Assistant";

function migrationZip(): Buffer {
  const conversation = JSON.stringify({
    id: "conv-1",
    title: "Old chat",
    createdAt: 1,
    updatedAt: 2,
    messages: [
      { role: "user", content: "hi from the old app", ts: 1 },
      { role: "assistant", content: "hello, carried over", ts: 2 },
    ],
  });
  return Buffer.from(
    zipSync({
      "CLAUDE.md": new TextEncoder().encode("# Assistant\nlegacy instructions"),
      ".houston/runtime/conversations/conv-1.json": new TextEncoder().encode(
        conversation,
      ),
      "notes/todo.txt": new TextEncoder().encode("a working file"),
    }),
  );
}

async function importInto(localRoot: string): Promise<void> {
  const vfs = new FsVfs(localRoot);
  const agentDir = join(localRoot, ...ROOT.split("/"));
  const { result } = await applyMigrationArchive({
    vfs,
    root: ROOT,
    agentDir,
    bytes: migrationZip(),
    overwrite: false,
  });
  expect(result.written).toBe(3);
  expect(result.sessionsRebuilt).toBe(true);
  // The completion marker the wizard writes via `migration/complete`.
  await vfs.writeText(
    `${ROOT}/.houston/migration/imported.json`,
    JSON.stringify({
      completedAt: "2026-01-01T00:00:00.000Z",
      source: "desktop",
    }),
  );
}

test("migrated data flushes to the object store and a fresh pod recovers it", async () => {
  const store = new LocalDirStore(scratch("mig-store-"));
  const podLocal = scratch("mig-pod-a-");

  // Boot a pod: hydrate an empty new agent, then start observing writes.
  const daemon = new StoreSyncDaemon({
    store,
    rootDir: podLocal,
    quietMs: 20,
    intervalMs: 60_000,
    log: () => {},
  });
  await daemon.hydrate();
  daemon.start();

  await importInto(podLocal);

  // A re-synthesized pi session exists on the pod's local disk.
  const sessionDir = join(
    podLocal,
    ...ROOT.split("/"),
    ".houston",
    "runtime",
    "sessions",
    "conv-1",
  );
  expect(existsSync(sessionDir)).toBe(true);
  expect(readdirSync(sessionDir).length).toBeGreaterThan(0);

  // Pod drains (SIGTERM → host.stop → syncDaemon.stop): the FINAL sync must
  // push everything the import wrote to the object store.
  await daemon.stop();

  const remote = JSON.stringify(await store.list(""));
  expect(remote).toContain(`${ROOT}/CLAUDE.md`);
  expect(remote).toContain(
    `${ROOT}/.houston/runtime/conversations/conv-1.json`,
  );
  expect(remote).toContain(`${ROOT}/notes/todo.txt`);
  expect(remote).toContain(`${ROOT}/.houston/migration/imported.json`);
  // The re-synthesized session round-trips too, so agent memory survives.
  expect(remote).toContain(`${ROOT}/.houston/runtime/sessions/conv-1/`);

  // A recycled pod starts from a blank emptyDir and only hydrates from the
  // store — the migrated agent must come back intact.
  const podLocalB = scratch("mig-pod-b-");
  const daemonB = new StoreSyncDaemon({
    store,
    rootDir: podLocalB,
    quietMs: 20,
    intervalMs: 60_000,
    log: () => {},
  });
  await daemonB.hydrate();
  const recoveredAgent = join(podLocalB, ...ROOT.split("/"));
  expect(existsSync(join(recoveredAgent, "CLAUDE.md"))).toBe(true);
  expect(
    existsSync(
      join(
        recoveredAgent,
        ".houston",
        "runtime",
        "conversations",
        "conv-1.json",
      ),
    ),
  ).toBe(true);
  expect(
    existsSync(join(recoveredAgent, ".houston", "migration", "imported.json")),
  ).toBe(true);
  expect(
    existsSync(
      join(recoveredAgent, ".houston", "runtime", "sessions", "conv-1"),
    ),
  ).toBe(true);
  await daemonB.stop();
});

// Guard the assumption the whole design rests on: nothing the migration writes
// is in the store-sync exclude set (credentials.json, claude-login creds, db/).
test("migration import writes nothing the store-sync excludes would drop", () => {
  const excluded = [
    "credentials.json",
    "claude-login/.credentials.json",
    "db/",
  ];
  const migrationPaths = [
    "CLAUDE.md",
    ".houston/runtime/conversations/conv-1.json",
    ".houston/runtime/sessions/conv-1/session.jsonl",
    ".houston/migration/imported.json",
    ".agents/skills/x/skill.md",
    "notes/todo.txt",
  ];
  for (const p of migrationPaths) {
    expect(
      excluded.some((e) => (e.endsWith("/") ? p.startsWith(e) : p === e)),
    ).toBe(false);
  }
});
