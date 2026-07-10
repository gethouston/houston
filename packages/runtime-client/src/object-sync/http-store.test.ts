import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { HttpObjectStore } from "./http-store";

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
