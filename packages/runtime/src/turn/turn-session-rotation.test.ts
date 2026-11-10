import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import { resumeSessionManager } from "../backends/pi/session-files";
import {
  seedRotatableSession,
  sessionFile,
} from "../backends/pi/session-rotation.test-support";
import { startTurnRequestFilesystem } from "./turn-claimed-hydration";
import { syncTurnFilesystem } from "./turn-filesystem";
import {
  ownConversationOnly,
  PI_SESSION_FALLBACK_MAX_BYTES,
} from "./turn-hot-set";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function temp() {
  const root = mkdtempSync(join(tmpdir(), "turn-session-rotation-"));
  roots.push(root);
  return root;
}

test.each([
  "data",
  "workspaces/Workspace/Agent/.houston/runtime",
])("%s hot set admits only the newest large log", (runtime) => {
  const prefix = `${runtime}/sessions/c1`;
  const old = `${prefix}/2026-01-01T00-00-00-000Z_test.jsonl`;
  const fallback = `${prefix}/2026-01-02T00-00-00-000Z_test.jsonl`;
  const newest = `${prefix}/2026-01-03T00-00-00-000Z_test.jsonl`;
  for (const size of [
    undefined,
    PI_SESSION_FALLBACK_MAX_BYTES + 1,
    142 * 1024 * 1024,
  ]) {
    const listing = [
      { rel: old, size: 1 },
      { rel: fallback, size },
      { rel: newest },
    ];
    const admit = ownConversationOnly("c1");
    expect(
      listing
        .filter(({ rel }) => admit(rel, listing, ""))
        .map(({ rel }) => rel),
    ).toEqual([newest]);
  }
  for (const size of [0, PI_SESSION_FALLBACK_MAX_BYTES]) {
    const listing = [
      { rel: old, size: 1 },
      { rel: fallback, size },
      { rel: newest },
    ];
    const admit = ownConversationOnly("c1");
    expect(
      listing
        .filter(({ rel }) => admit(rel, listing, ""))
        .map(({ rel }) => rel),
    ).toEqual([fallback, newest]);
  }
});

test.each([
  "data",
  "workspaces/Workspace/Agent/.houston/runtime",
])("%s pooled turns upload only the successor and next hydrate only its live segment", async (runtime) => {
  const remote = temp();
  const prefix = "store";
  const seeded = seedRotatableSession(
    temp(),
    join(remote, prefix, runtime, "sessions/c1"),
  );
  const old = `${runtime}/sessions/c1/${basename(sessionFile(seeded.manager))}`;
  const originalBytes = readFileSync(join(remote, prefix, old));
  const store = new LocalDirStore(remote);
  const hydrateTurn = () =>
    startTurnRequestFilesystem({
      store,
      prefix,
      root: temp(),
      turn: {
        conversationId: "c1",
        claim: {
          id: "claim",
          token: "token",
          bootId: "boot",
          heartbeatUrl: "https://heartbeat.test",
        },
      },
      timings: {},
    });
  const first = await hydrateTurn();
  const filesystem = await first.hydrated;
  await filesystem.workspaceReady;
  const manager = resumeSessionManager(
    filesystem.workspaceDir,
    join(filesystem.dataDir, "sessions/c1"),
    false,
  );
  const successor = `${runtime}/sessions/c1/${basename(sessionFile(manager))}`;
  expect(successor).not.toBe(old);
  const sync = await syncTurnFilesystem({
    store,
    prefix,
    filesystem,
    conversationId: "c1",
    claimed: true,
  });
  expect(sync.uploaded).toEqual([successor]);
  expect(sync.deleted).toEqual([]);
  expect(readFileSync(join(remote, prefix, old)).equals(originalBytes)).toBe(
    true,
  );

  const second = await hydrateTurn();
  const next = await second.hydrated;
  await next.workspaceReady;
  expect(next.manifest.has(successor)).toBe(true);
  expect(next.manifest.has(old)).toBe(false);
  expect(existsSync(join(next.storeRoot, old))).toBe(false);
  const resumed = resumeSessionManager(
    next.workspaceDir,
    join(next.dataDir, "sessions/c1"),
    false,
  );
  expect(resumed.buildSessionContext()).toEqual(
    seeded.manager.buildSessionContext(),
  );
  expect(resumed.getLeafId()).toBe(seeded.manager.getLeafId());
});
