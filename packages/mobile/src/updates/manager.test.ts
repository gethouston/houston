import { generateKeyPairSync } from "node:crypto";
import { expect, test, vi } from "vitest";
import { signManifest } from "../../scripts/sign-update";
import { createUpdateManager } from "./manager";
import type { UpdateManifestBody } from "./manifest";

const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const key = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const pubkey = keys.publicKey
  .export({ type: "spki", format: "der" })
  .toString("base64");
const baseUrl = "https://storage.googleapis.com/houston-mobile-updates";
const body: UpdateManifestBody = {
  v: 1,
  version: "0.5.41+new",
  url: `${baseUrl}/preview/new.zip`,
  sha256: "a".repeat(64),
  min_native_build: 2,
  required_native_build: 2,
  published_at: "2026-10-08T00:00:00.000Z",
};

test("checks signed manifest, downloads once, and stages next without reload", async () => {
  let now = 0;
  const download = vi.fn().mockResolvedValue({ id: "bundle" });
  const next = vi.fn().mockResolvedValue({});
  const report = vi.fn();
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ...body, signature: signManifest(body, key) }),
  });
  const check = createUpdateManager(
    {
      baseUrl,
      publicKey: pubkey,
      channel: "preview",
      builtinVersion: "0.5.41+old",
    },
    {
      fetch: fetcher as typeof fetch,
      now: () => now,
      updater: {
        current: async () => ({
          bundle: { id: "builtin", version: "1.0" },
        }),
        download,
        next,
      },
      nativeBuild: async () => "2",
      isOnline: () => true,
      onRequired: vi.fn(),
      report,
    },
  );
  await check();
  await check();
  expect(fetcher).toHaveBeenCalledWith(`${baseUrl}/preview/manifest.json`, {
    cache: "no-store",
  });
  expect(download).toHaveBeenCalledWith({
    url: body.url,
    version: body.version,
    checksum: body.sha256,
  });
  expect(next).toHaveBeenCalledWith({ id: "bundle" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(report).not.toHaveBeenCalled();
  now = 30 * 60 * 1000;
  await check();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("required native build gates the app and invalid signatures report", async () => {
  const gate = vi.fn();
  const report = vi.fn();
  const updater = { current: vi.fn(), download: vi.fn(), next: vi.fn() };
  const check = createUpdateManager(
    { baseUrl, publicKey: pubkey, channel: "preview", builtinVersion: "old" },
    {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...body,
          required_native_build: 3,
          signature: signManifest({ ...body, required_native_build: 3 }, key),
        }),
      }) as typeof fetch,
      now: () => 0,
      updater,
      nativeBuild: async () => "2",
      isOnline: () => true,
      onRequired: gate,
      report,
    },
  );
  await check();
  expect(gate).toHaveBeenCalledOnce();
  expect(updater.download).not.toHaveBeenCalled();
  expect(report).not.toHaveBeenCalled();
  const invalid = createUpdateManager(
    { baseUrl, publicKey: pubkey, channel: "preview", builtinVersion: "old" },
    {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...body, signature: "broken" }),
      }) as typeof fetch,
      now: () => 0,
      updater,
      nativeBuild: async () => "2",
      isOnline: () => true,
      onRequired: gate,
      report,
    },
  );
  await invalid();
  expect(report).toHaveBeenCalledOnce();
});

test("offline checks wait for the next eligible resume without reporting", async () => {
  let now = 0;
  const report = vi.fn();
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Network unavailable"))
    .mockResolvedValue({
      ok: true,
      json: async () => ({ ...body, signature: signManifest(body, key) }),
    });
  const updater = {
    current: vi
      .fn()
      .mockResolvedValue({ bundle: { id: "builtin", version: "1.0" } }),
    download: vi.fn().mockResolvedValue({ id: "bundle" }),
    next: vi.fn().mockResolvedValue({}),
  };
  const check = createUpdateManager(
    {
      baseUrl,
      publicKey: pubkey,
      channel: "preview",
      builtinVersion: body.version,
    },
    {
      fetch: fetcher as typeof fetch,
      now: () => now,
      updater,
      nativeBuild: async () => "2",
      isOnline: () => true,
      onRequired: vi.fn(),
      report,
    },
  );
  await check();
  expect(report).not.toHaveBeenCalled();
  now = 30 * 60 * 1000;
  await check();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(updater.download).not.toHaveBeenCalled();
});

test("a build below the OTA minimum keeps its current bundle without gating", async () => {
  const gate = vi.fn();
  const updater = { current: vi.fn(), download: vi.fn(), next: vi.fn() };
  const check = createUpdateManager(
    { baseUrl, publicKey: pubkey, channel: "preview", builtinVersion: "old" },
    {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...body,
          min_native_build: 3,
          signature: signManifest({ ...body, min_native_build: 3 }, key),
        }),
      }) as typeof fetch,
      now: () => 0,
      updater,
      nativeBuild: async () => "2",
      isOnline: () => true,
      onRequired: gate,
      report: vi.fn(),
    },
  );
  await check();
  expect(gate).not.toHaveBeenCalled();
  expect(updater.download).not.toHaveBeenCalled();
});
