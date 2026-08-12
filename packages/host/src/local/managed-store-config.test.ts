import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { managedStoreConfig } from "./managed-store-config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("shared pod-store config uses the org route and binds requests to the agent slug", async () => {
  vi.stubEnv("HOUSTON_STORE_URL", "https://store.test/");
  vi.stubEnv("HOUSTON_ORG_SLUG", "acme org");
  vi.stubEnv("HOUSTON_AGENT_SLUG", "writer");
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    // Fresh Response per call: the boot-time lease claim reads its own body.
    // 404 = old/unfenced gateway, the compatibility path this test rides.
    .mockImplementation(async (url) =>
      String(url).endsWith("/lease")
        ? Response.json({ error: "not found" }, { status: 404 })
        : Response.json({ objects: [] }),
    );
  const config = await managedStoreConfig(
    "pod-token",
    "/data",
    async (message) => {
      throw new Error(message);
    },
  );
  if (!config) throw new Error("expected managed store config");

  await config.sharedMirror.store.manifest();

  expect(fetchSpy).toHaveBeenCalledWith(
    "https://store.test/v1/pod/store/acme%20org/shared/manifest",
    {
      headers: {
        Authorization: "Bearer pod-token",
        "X-Houston-Agent": "writer",
      },
    },
  );
  expect(config.sharedMirror.mirrorDir).toBe("/data/shared-mirror");
});

test("agent store shares a boot id and fencing holder while shared writes do not", async () => {
  vi.stubEnv("HOUSTON_STORE_URL", "https://store.test");
  vi.stubEnv("HOUSTON_ORG_SLUG", "acme");
  vi.stubEnv("HOUSTON_AGENT_SLUG", "writer");
  const requests: Array<{ headers: Headers; url: string }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    requests.push({ headers: new Headers(init?.headers), url });
    if (url.endsWith("/manifest")) {
      return Response.json(
        { objects: [] },
        { headers: { "X-Houston-Fencing-Token": "77" } },
      );
    }
    return Response.json({
      key: "notes.txt",
      size: 5,
      md5: "md5",
      updated: "2026-08-12T00:00:00Z",
    });
  });
  const config = await managedStoreConfig(
    "pod-token",
    "/data",
    async (message) => {
      throw new Error(message);
    },
  );
  if (!config) throw new Error("expected managed store config");
  const dir = mkdtempSync(join(tmpdir(), "managed-store-config-"));
  const source = join(dir, "notes.txt");
  writeFileSync(source, "notes");

  await config.storeSync.store.manifest?.();
  await config.storeSync.store.upload(source, "notes.txt");
  await config.storeSync.store.upload(source, "notes.txt");
  await config.sharedMirror.store.manifest();
  await config.sharedMirror.store.upload(source, "notes.txt");

  const agentWrites = requests.filter(({ url }) =>
    url.includes("/acme/writer/objects/"),
  );
  const bootId = agentWrites[0]?.headers.get("x-houston-boot-id");
  expect(bootId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(
    agentWrites.map(({ headers }) => ({
      bootId: headers.get("x-houston-boot-id"),
      fencingToken: headers.get("x-houston-fencing-token"),
    })),
  ).toEqual([
    { bootId, fencingToken: "77" },
    { bootId, fencingToken: "77" },
  ]);
  const sharedWrite = requests.find(({ url }) =>
    url.includes("/acme/shared/objects/"),
  );
  expect(sharedWrite?.headers.get("x-houston-fencing-token")).toBeNull();
  expect(sharedWrite?.headers.get("x-houston-boot-id")).toBeNull();
});

test("boot claims the write lease before any store traffic and seeds the fence", async () => {
  vi.stubEnv("HOUSTON_STORE_URL", "https://store.test");
  vi.stubEnv("HOUSTON_ORG_SLUG", "acme");
  vi.stubEnv("HOUSTON_AGENT_SLUG", "writer");
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/lease")) return Response.json({ token: "7" });
    if (init?.method === "PUT") {
      return Response.json({
        key: "workspaces/f.txt",
        size: 1,
        md5: "x",
        updated: "now",
      });
    }
    return Response.json({ objects: [] });
  });
  const config = await managedStoreConfig("pod-token", "/data", async (m) => {
    throw new Error(m);
  });
  if (!config) throw new Error("expected managed store config");

  const lease = calls[0];
  if (!lease) throw new Error("expected a boot lease claim");
  expect(lease.url).toBe("https://store.test/v1/pod/store/acme/writer/lease");
  expect(lease.init?.method).toBe("POST");
  const body = JSON.parse(String(lease.init?.body)) as { bootId?: string };
  expect(body.bootId).toBeTruthy();

  // The claimed token is echoed on the agent store's next write.
  const src = join(mkdtempSync(join(tmpdir(), "lease-test-")), "f.txt");
  writeFileSync(src, "x");
  await config.storeSync.store.upload(src, "workspaces/f.txt");
  const put = calls.find((c) => c.init?.method === "PUT");
  const headers = (put?.init?.headers ?? {}) as Record<string, string>;
  expect(headers["X-Houston-Fencing-Token"]).toBe("7");
  expect(headers["X-Houston-Boot-Id"]).toBe(body.bootId);
});
