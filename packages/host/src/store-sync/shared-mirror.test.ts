import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ManifestObjectStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { SharedMirrorController } from "./shared-mirror";

const md5 = (body: Buffer) => createHash("md5").update(body).digest("base64");

function memoryStore(initial: Record<string, string>) {
  const objects = new Map(
    Object.entries(initial).map(([key, body]) => [key, Buffer.from(body)]),
  );
  const uploads: string[] = [];
  const store: ManifestObjectStore = {
    async manifest() {
      return [...objects.entries()].map(([key, body]) => ({
        key,
        size: body.length,
        md5: md5(body),
        updated: "2026-07-30T00:00:00Z",
      }));
    },
    async download(key, destination) {
      const body = objects.get(key);
      if (!body) throw new Error(`missing ${key}`);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, body);
    },
    async upload(source, key) {
      // Read BEFORE recording: `eventually()` polls `uploads`, and recording
      // first opens a window where the upload is visible but `objects` still
      // holds the previous bytes — a flaky TOCTOU on slow runners.
      const body = await readFile(source);
      objects.set(key, body);
      uploads.push(key);
    },
  };
  return { objects, store, uploads };
}

async function eventually(assertion: () => void): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assertion();
}

test("turn-start probes are debounced and an unchanged manifest stays a cheap GET", async () => {
  let now = 1_000;
  let probes = 0;
  const store: ManifestObjectStore = {
    async manifest() {
      probes += 1;
      return [];
    },
    async download() {
      throw new Error("empty manifest must not download");
    },
    async upload() {
      throw new Error("unchanged mirror must not upload");
    },
  };
  const controller = new SharedMirrorController({
    store,
    mirrorDir: mkdtempSync(join(tmpdir(), "shared-controller-")),
    now: () => now,
    log: () => {},
  });

  await controller.beforeTurn();
  now += 14_999;
  await controller.beforeTurn();
  expect(probes).toBe(1);

  now += 2;
  await controller.beforeTurn();
  expect(probes).toBe(2);
  await controller.stop();
});

test("a failed wake logs once and never rejects a joining turn", async () => {
  const logs: Array<{ message: string; error?: unknown }> = [];
  const store: ManifestObjectStore = {
    async manifest() {
      throw new Error("shared store unavailable");
    },
    async download() {},
    async upload() {},
  };
  const controller = new SharedMirrorController({
    store,
    mirrorDir: mkdtempSync(join(tmpdir(), "shared-controller-fail-")),
    log: (message, error) => logs.push({ message, error }),
  });

  controller.wake();
  await expect(controller.beforeTurn()).resolves.toBeUndefined();
  expect(logs).toHaveLength(1);
  expect(logs[0]?.message).toContain("wake sync failed");
  expect(logs[0]?.error).toMatchObject({
    message: "shared store unavailable",
  });
  await controller.stop();
});

test("a failed turn-start probe logs the real error and lets the turn continue", async () => {
  const logs: Array<{ message: string; error?: unknown }> = [];
  const controller = new SharedMirrorController({
    store: {
      async manifest() {
        throw new Error("probe timed out");
      },
      async download() {},
      async upload() {},
    },
    mirrorDir: mkdtempSync(join(tmpdir(), "shared-controller-probe-fail-")),
    log: (message, error) => logs.push({ message, error }),
  });

  await expect(controller.beforeTurn()).resolves.toBeUndefined();

  expect(logs).toEqual([
    {
      message: "[shared-mirror] turn-start probe failed; using current mirror",
      error: expect.objectContaining({ message: "probe timed out" }),
    },
  ]);
  await controller.stop();
});

test("the watcher debounces local edits into a prompt push-only cycle", async () => {
  const remote = memoryStore({ "skills/a/SKILL.md": "a v1" });
  const mirrorDir = mkdtempSync(join(tmpdir(), "shared-controller-watch-"));
  const controller = new SharedMirrorController({
    store: remote.store,
    mirrorDir,
    watchDebounceMs: 30,
    log: () => {},
  });
  controller.wake();
  await controller.beforeTurn();
  const file = join(mirrorDir, "skills", "a", "SKILL.md");

  writeFileSync(file, "a local v2");
  writeFileSync(file, "a local v3");
  await eventually(() => expect(remote.uploads).toEqual(["skills/a/SKILL.md"]));

  expect(remote.objects.get("skills/a/SKILL.md")?.toString()).toBe(
    "a local v3",
  );
  await controller.stop();
});

test("pull watcher echoes never upload the downloaded bytes", async () => {
  const remote = memoryStore({ "skills/a/SKILL.md": "remote bytes" });
  const mirrorDir = mkdtempSync(join(tmpdir(), "shared-controller-echo-"));
  const controller = new SharedMirrorController({
    store: remote.store,
    mirrorDir,
    watchDebounceMs: 30,
    log: () => {},
  });

  controller.wake();
  await controller.beforeTurn();
  await new Promise((resolve) => setTimeout(resolve, 100));

  expect(remote.uploads).toEqual([]);
  expect(readFileSync(join(mirrorDir, "skills", "a", "SKILL.md"), "utf8")).toBe(
    "remote bytes",
  );
  await controller.stop();
});

test("logs a local-wins conflict with the key", async () => {
  const remote = memoryStore({ "skills/a/SKILL.md": "a v1" });
  const mirrorDir = mkdtempSync(join(tmpdir(), "shared-controller-conflict-"));
  const logs: string[] = [];
  const controller = new SharedMirrorController({
    store: remote.store,
    mirrorDir,
    debounceMs: 0,
    watchDebounceMs: 60_000,
    log: (message) => logs.push(message),
  });
  controller.wake();
  await controller.beforeTurn();
  writeFileSync(
    join(mirrorDir, "skills", "a", "SKILL.md"),
    "intentional local edit",
  );
  remote.objects.set("skills/a/SKILL.md", Buffer.from("remote edit"));

  await controller.beforeTurn();

  expect(logs).toContain(
    "[shared-mirror] local edit won concurrent change for skills/a/SKILL.md",
  );
  await controller.stop();
});

test("a watcher push failure logs the real error and retries next cycle", async () => {
  const remote = memoryStore({ "skills/a/SKILL.md": "a v1" });
  let failUpload = true;
  const store: ManifestObjectStore = {
    ...remote.store,
    async upload(source, key) {
      if (failUpload) {
        failUpload = false;
        throw new Error("shared PUT unavailable");
      }
      await remote.store.upload(source, key);
    },
  };
  const mirrorDir = mkdtempSync(join(tmpdir(), "shared-controller-retry-"));
  const logs: Array<{ error?: unknown; message: string }> = [];
  const controller = new SharedMirrorController({
    store,
    mirrorDir,
    watchDebounceMs: 30,
    log: (message, error) => logs.push({ message, error }),
  });
  controller.wake();
  await controller.beforeTurn();
  writeFileSync(join(mirrorDir, "skills", "a", "SKILL.md"), "retry this edit");
  await eventually(() =>
    expect(logs).toContainEqual({
      message: "[shared-mirror] watcher push failed; using current mirror",
      error: expect.objectContaining({ message: "shared PUT unavailable" }),
    }),
  );

  await expect(controller.beforeTurn()).resolves.toBeUndefined();

  expect(remote.objects.get("skills/a/SKILL.md")?.toString()).toBe(
    "retry this edit",
  );
  await controller.stop();
});
