import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ManifestObjectStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { SharedMirrorController } from "./shared-mirror";

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
});

test("a failed wake logs once and never rejects a joining turn", async () => {
  const logs: Array<{ message: string; error?: unknown }> = [];
  const store: ManifestObjectStore = {
    async manifest() {
      throw new Error("shared store unavailable");
    },
    async download() {},
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
});

test("a failed turn-start probe logs the real error and lets the turn continue", async () => {
  const logs: Array<{ message: string; error?: unknown }> = [];
  const controller = new SharedMirrorController({
    store: {
      async manifest() {
        throw new Error("probe timed out");
      },
      async download() {},
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
});
