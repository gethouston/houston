import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { waitForPredecessorDrain } from "../store-sync/predecessor-drain";
import { managedStoreConfig } from "./managed-store-config";

vi.mock("../store-sync/predecessor-drain", () => ({
  waitForPredecessorDrain: vi.fn(async () => {}),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function stubManagedStoreEnv() {
  vi.stubEnv("HOUSTON_STORE_URL", "https://store.test");
  vi.stubEnv("HOUSTON_ORG_SLUG", "acme");
  vi.stubEnv("HOUSTON_AGENT_SLUG", "writer");
}

test("retries a transient lease failure and boots fenced", async () => {
  stubManagedStoreEnv();
  vi.useFakeTimers();
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({}, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ token: "lease-2" }));

  const configPromise = managedStoreConfig(
    "pod-token",
    "/data",
    async (message) => {
      throw new Error(message);
    },
  );
  await vi.runAllTimersAsync();
  const config = await configPromise;

  expect(config?.podGateway.fence.token).toBe("lease-2");
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  const signals = fetchSpy.mock.calls.map(([, init]) => init?.signal);
  expect(signals[0]).toBeInstanceOf(AbortSignal);
  expect(signals[1]).toBeInstanceOf(AbortSignal);
  expect(signals[1]).not.toBe(signals[0]);
});

test("threads the lease response's generation capability into both sync configs", async () => {
  stubManagedStoreEnv();
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    Response.json({ token: "9", generations: true }),
  );

  const config = await managedStoreConfig("pod-token", "/data", async (m) => {
    throw new Error(m);
  });

  expect(config?.storeSync.generations).toBe(true);
  expect(config?.sharedMirror.generations).toBe(true);
});

test("a standing pod's stores hydrate one object at a time, never batched", async () => {
  stubManagedStoreEnv();
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    Response.json({ token: "9", generations: true }),
  );

  const config = await managedStoreConfig("pod-token", "/data", async (m) => {
    throw new Error(m);
  });

  expect(config?.storeSync.store.downloadMany).toBeUndefined();
  expect(config?.sharedMirror.store.downloadMany).toBeUndefined();
});

test("an old gateway without the capability field leaves generations undefined", async () => {
  stubManagedStoreEnv();
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    Response.json({ token: "9" }),
  );

  const config = await managedStoreConfig("pod-token", "/data", async (m) => {
    throw new Error(m);
  });

  expect(config?.storeSync.generations).toBeUndefined();
  expect(config?.sharedMirror.generations).toBeUndefined();
});

test("fails boot after persistent transient lease failures exhaust retries", async () => {
  stubManagedStoreEnv();
  vi.useFakeTimers();
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({}, { status: 503 }));
  const fatal = vi.fn(async (message: string): Promise<never> => {
    throw new Error(message);
  });

  const configPromise = managedStoreConfig("pod-token", "/data", fatal);
  const rejectedConfig = expect(configPromise).rejects.toThrow(
    "write-lease claim failed (503)",
  );
  await vi.runAllTimersAsync();

  await rejectedConfig;
  expect(fetchSpy).toHaveBeenCalledTimes(3);
  expect(fatal).toHaveBeenCalledOnce();
});

test("boots unfenced without retry when the lease route is absent", async () => {
  stubManagedStoreEnv();
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({}, { status: 404 }));

  const config = await managedStoreConfig(
    "pod-token",
    "/data",
    async (message) => {
      throw new Error(message);
    },
  );

  expect(config?.podGateway.fence.token).toBeUndefined();
  expect(fetchSpy).toHaveBeenCalledOnce();
});

test("shared pod-store config uses the org route and binds requests to the agent slug", async () => {
  vi.stubEnv("HOUSTON_STORE_URL", "https://store.test/");
  vi.stubEnv("HOUSTON_ORG_SLUG", "acme org");
  vi.stubEnv("HOUSTON_AGENT_SLUG", "writer");
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
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

test("boot claims the write lease before any other store traffic and seeds the fence", async () => {
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

  const src = join(mkdtempSync(join(tmpdir(), "lease-test-")), "f.txt");
  writeFileSync(src, "x");
  await config.storeSync.store.upload(src, "workspaces/f.txt");
  const put = calls.find((c) => c.init?.method === "PUT");
  const headers = (put?.init?.headers ?? {}) as Record<string, string>;
  expect(headers["X-Houston-Fencing-Token"]).toBe("7");
  expect(headers["X-Houston-Boot-Id"]).toBe(body.bootId);
});

test("claims the lease only after the predecessor's drain window closed", async () => {
  stubManagedStoreEnv();
  let drained!: () => void;
  const drainWindow = new Promise<void>((resolve) => {
    drained = resolve;
  });
  vi.mocked(waitForPredecessorDrain).mockImplementationOnce(
    async ({ store }) => {
      await store.manifest?.();
      await drainWindow;
    },
  );
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    calls.push(`${init?.method ?? "GET"} ${String(url)}`);
    if (String(url).endsWith("/lease")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return Response.json(
      { objects: [] },
      { headers: { "X-Houston-Fencing-Token": "41" } },
    );
  });

  const configPromise = managedStoreConfig("pod-token", "/data", async (m) => {
    throw new Error(m);
  });
  await vi.waitFor(() => expect(calls).toHaveLength(1));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(calls).toEqual([
    "GET https://store.test/v1/pod/store/acme/writer/manifest",
  ]);

  drained();
  const config = await configPromise;
  expect(calls[1]).toBe(
    "POST https://store.test/v1/pod/store/acme/writer/lease",
  );
  expect(config?.podGateway.fence.token).toBeUndefined();
});

test("the lease check rides the agent prefix with this boot's write headers", async () => {
  stubManagedStoreEnv();
  const calls: { url: string; headers: Headers }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    if (init?.method === "POST") return Response.json({ token: "12" });
    return Response.json(
      { error: "fencing token stale", holder: "live" },
      { status: 409 },
    );
  });
  const config = await managedStoreConfig("pod-token", "/data", async (m) => {
    throw new Error(m);
  });
  if (!config) throw new Error("expected managed store config");

  expect(await config.storeSync.leaseProbe()).toEqual({
    state: "fenced",
    holder: "live",
  });
  const check = calls[1];
  expect(check?.url).toBe("https://store.test/v1/pod/store/acme/writer/lease");
  expect(check?.headers.get("x-houston-fencing-token")).toBe("12");
  expect(check?.headers.get("x-houston-boot-id")).toBe(
    config.podGateway.bootId,
  );
});

test("a boot whose claim found no fencing reports no lease until a token appears", async () => {
  stubManagedStoreEnv();
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    calls.push(`${init?.method ?? "GET"} ${String(url)}`);
    return Response.json({ error: "not found" }, { status: 404 });
  });
  const config = await managedStoreConfig("pod-token", "/data", async (m) => {
    throw new Error(m);
  });
  if (!config) throw new Error("expected managed store config");

  expect(config.storeSync.leaseClaimed()).toBe(false);
  expect(
    calls.some((call) => call.startsWith("GET") && call.endsWith("/lease")),
  ).toBe(false);
  config.podGateway.fence.token = "3";
  expect(config.storeSync.leaseClaimed()).toBe(true);
});
