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
  channel: "preview",
  sequence: 10,
  bundle_sequence: 10,
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
      builtinSequence: 1,
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
      sequenceStore: { get: async () => null, set: async () => {} },
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
    {
      baseUrl,
      publicKey: pubkey,
      channel: "preview",
      builtinVersion: "old",
      builtinSequence: 1,
    },
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
      sequenceStore: { get: async () => null, set: async () => {} },
    },
  );
  await check();
  expect(gate).toHaveBeenCalledOnce();
  expect(updater.download).not.toHaveBeenCalled();
  expect(report).not.toHaveBeenCalled();
  const invalid = createUpdateManager(
    {
      baseUrl,
      publicKey: pubkey,
      channel: "preview",
      builtinVersion: "old",
      builtinSequence: 1,
    },
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
      sequenceStore: { get: async () => null, set: async () => {} },
    },
  );
  await invalid();
  expect(report).toHaveBeenCalledOnce();
});

test("required-update retry fetches a fresh manifest immediately", async () => {
  const gate = vi.fn();
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      ...body,
      required_native_build: 3,
      signature: signManifest({ ...body, required_native_build: 3 }, key),
    }),
  });
  const check = createUpdateManager(
    {
      baseUrl,
      publicKey: pubkey,
      channel: "preview",
      builtinVersion: "old",
      builtinSequence: 1,
    },
    {
      fetch: fetcher as typeof fetch,
      now: () => 0,
      updater: { current: vi.fn(), download: vi.fn(), next: vi.fn() },
      nativeBuild: async () => "2",
      isOnline: () => true,
      onRequired: gate,
      report: vi.fn(),
      sequenceStore: { get: async () => null, set: async () => {} },
    },
  );
  await check();
  await check(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(gate).toHaveBeenCalledTimes(2);
});

test("a forced check clears a lifted native requirement", async () => {
  const requiredBody = { ...body, required_native_build: 3 };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...requiredBody,
        signature: signManifest(requiredBody, key),
      }),
    })
    .mockResolvedValue({
      ok: true,
      json: async () => ({ ...body, signature: signManifest(body, key) }),
    });
  const onCleared = vi.fn();
  const onRequired = vi.fn();
  const check = createUpdateManager(
    {
      baseUrl,
      publicKey: pubkey,
      channel: "preview",
      builtinVersion: body.version,
      builtinSequence: 1,
    },
    {
      fetch: fetcher as typeof fetch,
      now: () => 0,
      updater: {
        current: async () => ({
          bundle: { id: "builtin", version: body.version },
        }),
        download: vi.fn(),
        next: vi.fn(),
      },
      nativeBuild: async () => "2",
      isOnline: () => true,
      onRequired,
      onCleared,
      report: vi.fn(),
      sequenceStore: { get: async () => null, set: async () => {} },
    },
  );
  expect(await check()).toBe("required");
  expect(await check(true)).toBe("clear");
  expect(onRequired).toHaveBeenCalledOnce();
  expect(onCleared).toHaveBeenCalledOnce();
});

test("native-build rejection is reported and the next check retries it", async () => {
  const nativeBuild = vi
    .fn()
    .mockRejectedValueOnce(new Error("native info failed"))
    .mockResolvedValue("2");
  const report = vi.fn();
  const check = createUpdateManager(
    {
      baseUrl,
      publicKey: pubkey,
      channel: "preview",
      builtinVersion: body.version,
      builtinSequence: (build) => Number(build),
    },
    {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...body, signature: signManifest(body, key) }),
      }) as typeof fetch,
      now: () => 0,
      updater: {
        current: async () => ({
          bundle: { id: "builtin", version: body.version },
        }),
        download: vi.fn(),
        next: vi.fn(),
      },
      nativeBuild,
      isOnline: () => true,
      onRequired: vi.fn(),
      report,
      sequenceStore: { get: async () => null, set: async () => {} },
    },
  );
  await check();
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({ message: "native info failed" }),
  );
  await check();
  expect(nativeBuild).toHaveBeenCalledTimes(2);
  expect(report).toHaveBeenCalledOnce();
});

test("a native info TypeError is reported instead of classified as a fetch outage", async () => {
  const report = vi.fn();
  const failure = new TypeError("native bridge unavailable");
  const check = createUpdateManager(
    {
      baseUrl,
      publicKey: pubkey,
      channel: "preview",
      builtinVersion: body.version,
      builtinSequence: 1,
    },
    {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...body, signature: signManifest(body, key) }),
      }) as typeof fetch,
      now: () => 0,
      updater: { current: vi.fn(), download: vi.fn(), next: vi.fn() },
      nativeBuild: async () => {
        throw failure;
      },
      isOnline: () => true,
      onRequired: vi.fn(),
      report,
      sequenceStore: { get: async () => null, set: async () => {} },
    },
  );
  await check();
  expect(report).toHaveBeenCalledWith(failure);
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
      builtinSequence: 1,
    },
    {
      fetch: fetcher as typeof fetch,
      now: () => now,
      updater,
      nativeBuild: async () => "2",
      isOnline: () => true,
      onRequired: vi.fn(),
      report,
      sequenceStore: { get: async () => null, set: async () => {} },
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
    {
      baseUrl,
      publicKey: pubkey,
      channel: "preview",
      builtinVersion: "old",
      builtinSequence: 1,
    },
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
      sequenceStore: { get: async () => null, set: async () => {} },
    },
  );
  await check();
  expect(gate).not.toHaveBeenCalled();
  expect(updater.download).not.toHaveBeenCalled();
});

test("legacy signed manifests cannot stage a downgrade", async () => {
  const download = vi.fn();
  const report = vi.fn();
  const check = createUpdateManager(
    {
      baseUrl,
      publicKey: pubkey,
      channel: "preview",
      builtinVersion: "0.5.42+new",
      builtinSequence: 11,
    },
    {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          const {
            channel: _channel,
            sequence: _sequence,
            bundle_sequence: _bundleSequence,
            ...legacy
          } = body;
          return {
            ...legacy,
            signature: signManifest(legacy as UpdateManifestBody, key),
          };
        },
      }) as typeof fetch,
      now: () => 0,
      updater: {
        current: async () => ({
          bundle: { id: "builtin", version: "0.5.42+new" },
        }),
        download,
        next: vi.fn(),
      },
      nativeBuild: async () => "2",
      isOnline: () => true,
      onRequired: vi.fn(),
      report,
      sequenceStore: { get: async () => null, set: async () => {} },
    },
  );
  await check();
  expect(download).not.toHaveBeenCalled();
  expect(report).toHaveBeenCalledOnce();
});

test("signed preview manifest cannot cross into production", async () => {
  const download = vi.fn();
  const report = vi.fn();
  const check = createUpdateManager(
    {
      baseUrl,
      publicKey: pubkey,
      channel: "production",
      builtinVersion: "old",
      builtinSequence: 1,
    },
    {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...body, signature: signManifest(body, key) }),
      }) as typeof fetch,
      now: () => 0,
      updater: {
        current: async () => ({ bundle: { id: "builtin", version: "old" } }),
        download,
        next: vi.fn(),
      },
      nativeBuild: async () => "2",
      isOnline: () => true,
      onRequired: vi.fn(),
      report,
      sequenceStore: { get: async () => null, set: async () => {} },
    },
  );
  await check();
  expect(download).not.toHaveBeenCalled();
  expect(report).toHaveBeenCalledOnce();
});

test("stored and built-in sequences reject replay before download", async () => {
  const download = vi.fn();
  for (const [stored, builtin] of [
    ["10", 1],
    [null, 10],
  ] as const) {
    const check = createUpdateManager(
      {
        baseUrl,
        publicKey: pubkey,
        channel: "preview",
        builtinVersion: "newer",
        builtinSequence: builtin,
      },
      {
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ ...body, signature: signManifest(body, key) }),
        }) as typeof fetch,
        now: () => 0,
        updater: {
          current: async () => ({
            bundle: { id: "builtin", version: "newer" },
          }),
          download,
          next: vi.fn(),
        },
        nativeBuild: async () => "2",
        isOnline: () => true,
        onRequired: vi.fn(),
        report: vi.fn(),
        sequenceStore: { get: async () => stored, set: async () => {} },
      },
    );
    await check();
  }
  expect(download).not.toHaveBeenCalled();
});

test("a freshly republished old zip cannot replace a newer built-in bundle", async () => {
  const republished = {
    ...body,
    sequence: 12,
    bundle_sequence: 9,
    version: "0.5.40+old",
  };
  const download = vi.fn();
  const check = createUpdateManager(
    {
      baseUrl,
      publicKey: pubkey,
      channel: "preview",
      builtinVersion: "0.5.42+new",
      builtinSequence: 11,
    },
    {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...republished,
          signature: signManifest(republished, key),
        }),
      }) as typeof fetch,
      now: () => 0,
      updater: {
        current: async () => ({
          bundle: { id: "builtin", version: "0.5.42+new" },
        }),
        download,
        next: vi.fn(),
      },
      nativeBuild: async () => "2",
      isOnline: () => true,
      onRequired: vi.fn(),
      report: vi.fn(),
      sequenceStore: { get: async () => null, set: async () => {} },
    },
  );
  await check();
  expect(download).not.toHaveBeenCalled();
});

test("a higher publish sequence rolls back an OTA zip above the native baseline", async () => {
  const rollback = {
    ...body,
    sequence: 12,
    bundle_sequence: 8,
    version: "0.5.40+old",
  };
  const download = vi.fn().mockResolvedValue({ id: "rollback" });
  const set = vi.fn();
  const check = createUpdateManager(
    {
      baseUrl,
      publicKey: pubkey,
      channel: "preview",
      builtinVersion: "0.5.39+builtin",
      builtinSequence: 7,
    },
    {
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...rollback,
          signature: signManifest(rollback, key),
        }),
      }) as typeof fetch,
      now: () => 0,
      updater: {
        current: async () => ({
          bundle: { id: "current", version: "0.5.42+new" },
        }),
        download,
        next: vi.fn(),
      },
      nativeBuild: async () => "2",
      isOnline: () => true,
      onRequired: vi.fn(),
      report: vi.fn(),
      sequenceStore: { get: async () => "11", set },
    },
  );
  await check();
  expect(download).toHaveBeenCalledOnce();
  expect(set).toHaveBeenCalledWith("12");
});
