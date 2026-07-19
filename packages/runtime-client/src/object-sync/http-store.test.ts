import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { HttpObjectStore } from "./http-store";
import { ObjectTooLargeError } from "./object-store";

const metadata = (key: string, size: number) => ({
  key,
  size,
  md5: "md5",
  updated: "2026-07-10T00:00:00Z",
});

test("round-trips objects through the agent-scoped HTTP API", async () => {
  const objects = new Map<string, Uint8Array>();
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    expect(init?.headers).toEqual({ Authorization: "Bearer pod-token" });
    if (url.pathname.endsWith("/manifest")) {
      const keys = [...objects.keys()].sort();
      return Response.json({
        objects: keys.map((key) =>
          metadata(key, objects.get(key)?.byteLength ?? 0),
        ),
      });
    }
    const marker = "/objects/";
    const key = url.pathname
      .slice(url.pathname.indexOf(marker) + marker.length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    if (init?.method === "PUT") {
      objects.set(key, new Uint8Array(init.body as Uint8Array));
      return Response.json(metadata(key, objects.get(key)?.byteLength ?? 0));
    }
    if (init?.method === "DELETE") {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    const bytes = objects.get(key);
    return bytes
      ? new Response(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
        )
      : new Response('{"error":"object not found"}', { status: 404 });
  };
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/v1/pod/store/org/agent/",
    token: "pod-token",
    fetchImpl,
  });
  const dir = mkdtempSync(join(tmpdir(), "http-object-store-"));
  const source = join(dir, "source.txt");
  const destination = join(dir, "nested", "destination.txt");
  writeFileSync(source, "hello");

  await store.upload(source, "folder/file.txt");
  expect(await store.list("folder")).toEqual(["folder/file.txt"]);
  await store.download("folder/file.txt", destination);
  expect(readFileSync(destination, "utf8")).toBe("hello");
  await store.delete("folder/file.txt");
  expect(await store.list("")).toEqual([]);
});

test("encodes each object-key path segment", async () => {
  let seenUrl = "";
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "token",
    fetchImpl: async (input) => {
      seenUrl = String(input);
      return new Response(null, { status: 204 });
    },
  });
  await store.delete("folder with space/file#1.txt");
  expect(seenUrl).toBe(
    "https://store.test/base/objects/folder%20with%20space/file%231.txt",
  );
});

test("propagates response details and rejects malformed success bodies", async () => {
  const failed = new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "token",
    fetchImpl: async () => new Response("gateway exploded", { status: 503 }),
    retryDelaysMs: [0, 0],
  });
  await expect(failed.list("workspace")).rejects.toThrow(
    "object store GET manifest failed (503): gateway exploded",
  );

  const malformed = new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "token",
    fetchImpl: async () => Response.json({ objects: [{ key: 42 }] }),
  });
  await expect(malformed.list("")).rejects.toThrow("malformed body");
});

test("tolerates delete 404", async () => {
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "token",
    fetchImpl: async () => new Response("missing", { status: 404 }),
  });
  await expect(store.delete("missing.txt")).resolves.toBeUndefined();
});

const flaky = (
  failures: Array<Error | Response>,
  then: () => Response,
): { fetchImpl: typeof fetch; calls: () => number } => {
  let calls = 0;
  return {
    fetchImpl: async () => {
      calls += 1;
      const failure = failures.shift();
      if (failure === undefined) return then();
      if (failure instanceof Error) throw failure;
      return failure;
    },
    calls: () => calls,
  };
};

const retryStore = (fetchImpl: typeof fetch) =>
  new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "token",
    fetchImpl,
    retryDelaysMs: [0, 0],
  });

test("retries a thrown network error and succeeds", async () => {
  const { fetchImpl, calls } = flaky([new TypeError("fetch failed")], () =>
    Response.json({ objects: [metadata("a.txt", 1)] }),
  );
  expect(await retryStore(fetchImpl).list("")).toEqual(["a.txt"]);
  expect(calls()).toBe(2);
});

test("retries a 503 response and succeeds", async () => {
  const { fetchImpl, calls } = flaky(
    [new Response("gateway restarting", { status: 503 })],
    () => Response.json({ objects: [] }),
  );
  expect(await retryStore(fetchImpl).list("")).toEqual([]);
  expect(calls()).toBe(2);
});

test("does not retry deterministic statuses", async () => {
  for (const status of [400, 401, 404, 500]) {
    const { fetchImpl, calls } = flaky(
      [],
      () => new Response("nope", { status }),
    );
    await expect(retryStore(fetchImpl).list("")).rejects.toThrow(
      `object store GET manifest failed (${status})`,
    );
    expect(calls()).toBe(1);
  }
});

test("rethrows the last error once retries are exhausted", async () => {
  const { fetchImpl, calls } = flaky(
    [
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
      new TypeError("fetch failed again"),
    ],
    () => Response.json({ objects: [] }),
  );
  await expect(retryStore(fetchImpl).list("")).rejects.toThrow(
    "fetch failed again",
  );
  expect(calls()).toBe(3);
});

test("retries upload and delete through transient failures", async () => {
  const dir = mkdtempSync(join(tmpdir(), "http-object-store-retry-"));
  const source = join(dir, "source.txt");
  writeFileSync(source, "hello");

  const put = flaky([new TypeError("fetch failed")], () =>
    Response.json(metadata("file.txt", 5)),
  );
  await expect(
    retryStore(put.fetchImpl).upload(source, "file.txt"),
  ).resolves.toBeUndefined();
  expect(put.calls()).toBe(2);

  const del = flaky(
    [new Response("bad gateway", { status: 502 })],
    () => new Response(null, { status: 204 }),
  );
  await expect(
    retryStore(del.fetchImpl).delete("file.txt"),
  ).resolves.toBeUndefined();
  expect(del.calls()).toBe(2);
});

test("retries download and still writes the file atomically", async () => {
  const dir = mkdtempSync(join(tmpdir(), "http-object-store-retry-dl-"));
  const destination = join(dir, "nested", "dest.txt");
  const { fetchImpl, calls } = flaky(
    [new Response("unavailable", { status: 503 })],
    () => new Response("payload"),
  );
  await retryStore(fetchImpl).download("file.txt", destination);
  expect(readFileSync(destination, "utf8")).toBe("payload");
  expect(calls()).toBe(2);
  expect(readdirSync(join(dir, "nested"))).toEqual(["dest.txt"]);
});

test("a 413 PUT surfaces as the typed ObjectTooLargeError, with no retry", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return Response.json({ error: "object too large" }, { status: 413 });
  };
  const store = new HttpObjectStore({
    baseUrl: "https://gw.test/v1/pod/store/o/a",
    token: "pod-token",
    fetchImpl,
    retryDelaysMs: [0, 0],
  });
  const dir = mkdtempSync(join(tmpdir(), "houston-store-413-"));
  writeFileSync(join(dir, "huge.mp4"), "H".repeat(32));

  const err = await store
    .upload(join(dir, "huge.mp4"), "work/huge.mp4")
    .then(() => null)
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ObjectTooLargeError);
  expect((err as ObjectTooLargeError).key).toBe("work/huge.mp4");
  expect(String(err)).toContain("failed (413)");
  // 413 is deterministic — the retry layer must not re-send the body.
  expect(calls).toBe(1);
});
