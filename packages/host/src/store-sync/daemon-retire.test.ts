import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LocalDirStore,
  type WriteLeaseVerdict,
} from "@houston/runtime-client/object-sync";
import { expect, test, vi } from "vitest";
import { StoreSyncDaemon } from "./daemon";
import { FENCE_RETIRED_MARKER } from "./daemon-hydrate";

function roots() {
  const remote = mkdtempSync(join(tmpdir(), "store-sync-retire-remote-"));
  const local = mkdtempSync(join(tmpdir(), "store-sync-retire-local-"));
  mkdirSync(join(remote, "workspace"), { recursive: true });
  mkdirSync(join(local, "workspace"), { recursive: true });
  return { remote, local };
}

function daemon(
  remote: string,
  local: string,
  extra: Partial<ConstructorParameters<typeof StoreSyncDaemon>[0]> = {},
) {
  return new StoreSyncDaemon({
    store: new LocalDirStore(remote),
    rootDir: local,
    quietMs: 60_000,
    intervalMs: 60_000,
    log: () => {},
    ...extra,
  });
}

test("after a fence retire the next boot prunes what the store dropped and keeps its own unsynced writes", async () => {
  const { remote, local } = roots();
  const session = "workspaces/Work/Sales/.houston/runtime/sessions/s1.json";
  writeFileSync(join(remote, "workspace", "kept.json"), "store copy");
  writeFileSync(join(local, "workspace", "kept.json"), "fenced pod copy");
  writeFileSync(join(local, "workspace", "deleted-by-pool-op.json"), "old");
  mkdirSync(join(local, "workspaces/Work/Sales/.houston/runtime/sessions"), {
    recursive: true,
  });
  writeFileSync(join(local, session), "a turn this pod never synced");
  writeFileSync(join(local, "credentials.json"), "{}");
  writeFileSync(
    join(local, FENCE_RETIRED_MARKER),
    JSON.stringify({
      retiredAt: "2026-10-05T00:00:00Z",
      synced: ["workspace/kept.json", "workspace/deleted-by-pool-op.json"],
    }),
  );

  const next = daemon(remote, local);
  await next.hydrate();

  expect(readFileSync(join(local, "workspace", "kept.json"), "utf8")).toBe(
    "store copy",
  );
  expect(existsSync(join(local, "workspace", "deleted-by-pool-op.json"))).toBe(
    false,
  );
  expect(readFileSync(join(local, session), "utf8")).toBe(
    "a turn this pod never synced",
  );
  expect(existsSync(join(local, "credentials.json"))).toBe(true);
  expect(existsSync(join(local, FENCE_RETIRED_MARKER))).toBe(false);
  await next.stop();
  expect(existsSync(join(remote, "workspace", "deleted-by-pool-op.json"))).toBe(
    false,
  );
  expect(existsSync(join(remote, session))).toBe(true);
});

test("an unreadable retire marker prunes nothing", async () => {
  const { remote, local } = roots();
  writeFileSync(join(local, "workspace", "mine.json"), "mine");
  writeFileSync(join(local, FENCE_RETIRED_MARKER), "2026-10-05T00:00:00Z");
  const next = daemon(remote, local);
  await next.hydrate();
  expect(existsSync(join(local, "workspace", "mine.json"))).toBe(true);
  expect(existsSync(join(local, FENCE_RETIRED_MARKER))).toBe(false);
  await next.stop();
});

test("an ordinary restart prunes nothing", async () => {
  const { remote, local } = roots();
  writeFileSync(join(local, "workspace", "unsynced.json"), "mine");
  const next = daemon(remote, local);
  await next.hydrate();
  expect(existsSync(join(local, "workspace", "unsynced.json"))).toBe(true);
  await next.stop();
});

test("retiring on a stale holder leaves the marker, which never syncs", async () => {
  const { remote, local } = roots();
  writeFileSync(join(remote, "workspace", "seen.json"), "{}");
  const holders: string[] = [];
  const fenced = daemon(remote, local, {
    leaseProbe: async (): Promise<WriteLeaseVerdict> => ({
      state: "fenced",
      holder: "stale",
    }),
    onFenceLost: (holder) => holders.push(holder),
  });
  await fenced.hydrate();
  fenced.start();
  expect(await fenced.writable()).toBe(false);
  expect(holders).toEqual(["stale"]);
  expect(
    JSON.parse(readFileSync(join(local, FENCE_RETIRED_MARKER), "utf8")),
  ).toMatchObject({ synced: ["workspace/seen.json"] });
  await fenced.stop();
  expect(existsSync(join(remote, FENCE_RETIRED_MARKER))).toBe(false);
});

test("syncAfterWrite uploads now only while the boot carries a lease token", async () => {
  const leased = roots();
  const withLease = daemon(leased.remote, leased.local, {
    leaseClaimed: () => true,
  });
  await withLease.hydrate();
  withLease.start();
  writeFileSync(join(leased.local, "workspace", "routines.json"), "07:00");
  withLease.syncAfterWrite();
  await vi.waitFor(() =>
    expect(
      readFileSync(join(leased.remote, "workspace", "routines.json"), "utf8"),
    ).toBe("07:00"),
  );
  await withLease.stop();

  const unfenced = roots();
  const noLease = daemon(unfenced.remote, unfenced.local, {
    leaseClaimed: () => false,
  });
  await noLease.hydrate();
  noLease.start();
  writeFileSync(join(unfenced.local, "workspace", "routines.json"), "07:00");
  noLease.syncAfterWrite();
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(existsSync(join(unfenced.remote, "workspace", "routines.json"))).toBe(
    false,
  );
  await noLease.stop();
  expect(existsSync(join(unfenced.remote, "workspace", "routines.json"))).toBe(
    true,
  );
});
