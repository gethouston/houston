import { mkdirSync, mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Routine } from "@houston/protocol";
import {
  LocalDirStore,
  type ObjectStore,
  StoreFencedError,
  type WriteLeaseVerdict,
} from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import type { RuntimeSpawner } from "../launcher/process";
import { buildLocalHost, type LocalHost } from "./host";

const AGENT = encodeURIComponent("Work/Sales");
const auth = {
  Authorization: "Bearer boot-secret",
  "Content-Type": "application/json",
};
const fakeSpawner: RuntimeSpawner = {
  spawn: () => ({ port: 0, kill: () => {} }),
};

class LeasedStore {
  private readonly objects = new LocalDirStore(
    mkdtempSync(join(tmpdir(), "fenced-pod-store-")),
  );
  private token = 0;
  private holder = "";
  private holderRenews = false;

  boot(bootId: string): {
    store: ObjectStore;
    leaseProbe: () => Promise<WriteLeaseVerdict>;
  } {
    this.claim(bootId, true);
    const token = this.token;
    const held = () => this.token === token && this.holder === bootId;
    const fence = (key: string) => {
      if (!held()) {
        throw new StoreFencedError(
          key,
          `object store PUT ${key} failed (409): {"error":"fencing token stale"}`,
        );
      }
    };
    return {
      store: {
        list: (prefix) => this.objects.list(prefix),
        download: (key, dest) => this.objects.download(key, dest),
        upload: async (source, key, opts) => {
          fence(key);
          return this.objects.upload(source, key, opts);
        },
        delete: async (key, opts) => {
          fence(key);
          await this.objects.delete(key, opts);
        },
      },
      leaseProbe: async () =>
        held()
          ? { state: "held" }
          : {
              state: "fenced",
              holder: this.holderRenews ? "live" : "stale",
            },
    };
  }

  mint(): void {
    this.claim("wake-op", false);
  }

  holderStops(): void {
    this.holderRenews = false;
  }

  private claim(holder: string, renews: boolean): void {
    this.token += 1;
    this.holder = holder;
    this.holderRenews = renews;
  }
}

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

const running: LocalHost[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((host) => host.stop()));
});

async function bootPod(
  remote: LeasedStore,
  bootId: string,
  leaseHeartbeatMs?: number,
  quietMs = 20,
) {
  const houstonHome = mkdtempSync(join(tmpdir(), "fenced-pod-"));
  const workspacesRoot = join(houstonHome, "workspaces");
  mkdirSync(join(workspacesRoot, "Work", "Sales"), { recursive: true });
  const port = await freePort();
  const fenceLost = vi.fn();
  const host = buildLocalHost({
    workspacesRoot,
    credentialsPath: join(houstonHome, "credentials.json"),
    port,
    token: "boot-secret",
    runtimeCommand: ["true"],
    spawner: fakeSpawner,
    storeSync: {
      ...remote.boot(bootId),
      leaseClaimed: () => true,
      quietMs,
      intervalMs: 60_000,
      leaseHeartbeatMs,
    },
    onStoreFenceLost: fenceLost,
  });
  await host.start();
  running.push(host);
  return { host, base: `http://127.0.0.1:${port}`, fenceLost };
}

async function routines(base: string): Promise<Routine[]> {
  const res = await fetch(`${base}/agents/${AGENT}/routines`, {
    headers: auth,
  });
  return ((await res.json()) as { items: Routine[] }).items;
}

async function stop(host: LocalHost): Promise<void> {
  running.splice(running.indexOf(host), 1);
  await host.stop();
}

test("an edit on a pod superseded while idle is refused, never acknowledged and reverted", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const remote = new LeasedStore();

  const seed = await bootPod(remote, "boot-seed");
  const created = await fetch(`${seed.base}/agents/${AGENT}/routines`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "Daily cloud release cut",
      prompt: "cut the release",
      schedule: "30 11 * * *",
    }),
  });
  expect(created.status).toBe(201);
  const routine = (await created.json()) as Routine;
  await stop(seed.host);

  const podA = await bootPod(remote, "boot-a");
  expect((await routines(podA.base))[0]?.schedule).toBe("30 11 * * *");
  remote.mint();

  const patched = await fetch(
    `${podA.base}/agents/${AGENT}/routines/${routine.id}`,
    {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ schedule: "0 7 * * *" }),
    },
  );
  const shownOnA = (await routines(podA.base))[0]?.schedule;
  await new Promise((resolve) => setTimeout(resolve, 200));
  await stop(podA.host);

  const podC = await bootPod(remote, "boot-c");
  const afterRecycle = (await routines(podC.base))[0]?.schedule;

  if (patched.ok) expect(afterRecycle).toBe("0 7 * * *");
  expect(patched.status).toBe(503);
  expect(await patched.json()).toMatchObject({ code: "store_fenced" });
  expect(shownOnA).toBe("30 11 * * *");
  expect(afterRecycle).toBe("30 11 * * *");
  expect(podA.fenceLost.mock.calls).toEqual([["stale"]]);

  const retried = await fetch(
    `${podC.base}/agents/${AGENT}/routines/${routine.id}`,
    {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ schedule: "0 7 * * *" }),
    },
  );
  expect(retried.status).toBe(200);
  await stop(podC.host);
  const podD = await bootPod(remote, "boot-d");
  expect((await routines(podD.base))[0]?.schedule).toBe("0 7 * * *");
  expect(podC.fenceLost).not.toHaveBeenCalled();
}, 60_000);

test("an idle superseded pod retires on its own", async () => {
  const remote = new LeasedStore();
  const pod = await bootPod(remote, "boot-a", 25);
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(pod.fenceLost).not.toHaveBeenCalled();

  remote.mint();
  await vi.waitFor(() => expect(pod.fenceLost.mock.calls).toEqual([["stale"]]));
}, 60_000);

test("a pod superseded by a running engine stands down, then retires when it stops", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const remote = new LeasedStore();
  const pod = await bootPod(remote, "boot-a", 25);
  remote.boot("boot-b");

  const refused = await fetch(`${pod.base}/agents/${AGENT}/routines`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ name: "x", prompt: "x", schedule: "0 7 * * *" }),
  });
  expect(refused.status).toBe(503);
  expect(pod.fenceLost.mock.calls).toEqual([["live"]]);
  expect((await fetch(`${pod.base}/health`)).status).toBe(503);
  const added = await fetch(`${pod.base}/sandbox/integrations/custom/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "x" }),
  });
  expect(added.status).toBe(503);
  expect(await added.json()).toMatchObject({ code: "store_fenced" });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(pod.fenceLost.mock.calls).toEqual([["live"]]);

  remote.holderStops();
  await vi.waitFor(() =>
    expect(pod.fenceLost.mock.calls).toEqual([["live"], ["stale"]]),
  );
}, 60_000);

test("an acknowledged edit survives a takeover that lands minutes later", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const remote = new LeasedStore();
  const seed = await bootPod(remote, "boot-seed");
  const created = await fetch(`${seed.base}/agents/${AGENT}/routines`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "Daily cloud release cut",
      prompt: "cut the release",
      schedule: "30 11 * * *",
    }),
  });
  const routine = (await created.json()) as Routine;
  await stop(seed.host);

  const podA = await bootPod(remote, "boot-a", undefined, 600_000);
  const patched = await fetch(
    `${podA.base}/agents/${AGENT}/routines/${routine.id}`,
    {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ schedule: "0 7 * * *" }),
    },
  );
  expect(patched.status).toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 300));
  remote.mint();
  await stop(podA.host);

  const podC = await bootPod(remote, "boot-c");
  expect((await routines(podC.base))[0]?.schedule).toBe("0 7 * * *");
}, 60_000);
