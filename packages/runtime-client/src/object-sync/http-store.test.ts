import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { HttpObjectStore, STREAM_UPLOAD_THRESHOLD_BYTES } from "./http-store";
import {
  ObjectTooLargeError,
  StoreConflictError,
  StoreFencedError,
} from "./object-store";

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

test("PUTs shared objects with the pod agent binding", async () => {
  const dir = mkdtempSync(join(tmpdir(), "http-shared-object-store-"));
  const source = join(dir, "SKILL.md");
  writeFileSync(source, "shared edit");
  let request:
    | { body: string; headers: Headers; method: string; url: string }
    | undefined;
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/v1/pod/store/acme/shared",
    token: "pod-token",
    agentSlug: "writer",
    fetchImpl: async (input, init) => {
      request = {
        body: Buffer.from(init?.body as Uint8Array).toString(),
        headers: new Headers(init?.headers),
        method: init?.method ?? "GET",
        url: String(input),
      };
      return Response.json(metadata("skills/research/SKILL.md", 11));
    },
  });

  await store.upload(source, "skills/research/SKILL.md");

  expect(request).toMatchObject({
    body: "shared edit",
    method: "PUT",
    url: "https://store.test/v1/pod/store/acme/shared/objects/skills/research/SKILL.md",
  });
  expect(request?.headers.get("authorization")).toBe("Bearer pod-token");
  expect(request?.headers.get("x-houston-agent")).toBe("writer");
});

test("captures a fencing token and echoes it with the stable boot id on writes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "http-fenced-object-store-"));
  const source = join(dir, "source.txt");
  writeFileSync(source, "hello");
  const requests: Headers[] = [];
  let call = 0;
  const fence: { token?: string } = {};
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/v1/pod/store/acme/agent",
    token: "pod-token",
    bootId: "boot-123",
    fence,
    fetchImpl: async (_input, init) => {
      requests.push(new Headers(init?.headers));
      call += 1;
      if (call === 1) {
        return Response.json(
          { objects: [{ ...metadata("notes.txt", 5), gen: 7 }] },
          { headers: { "X-Houston-Fencing-Token": "41" } },
        );
      }
      if (call === 2) {
        return Response.json(
          { ...metadata("notes.txt", 5), gen: "8" },
          {
            headers: {
              "X-Houston-Fencing-Token": "42",
              "X-Houston-Generation": "9",
            },
          },
        );
      }
      return new Response(null, { status: 204 });
    },
  });

  expect(await store.manifest()).toMatchObject([
    { key: "notes.txt", generation: "7" },
  ]);
  expect(
    await store.upload(source, "notes.txt", { ifGenerationMatch: "7" }),
  ).toEqual({ generation: "8" });
  await store.delete("notes.txt", { ifGenerationMatch: "8" });

  expect(requests[0]?.get("x-houston-fencing-token")).toBeNull();
  expect(requests[1]?.get("x-houston-fencing-token")).toBe("41");
  expect(requests[1]?.get("x-houston-boot-id")).toBe("boot-123");
  expect(requests[1]?.get("x-houston-if-generation-match")).toBe("7");
  expect(requests[2]?.get("x-houston-fencing-token")).toBe("42");
  expect(requests[2]?.get("x-houston-boot-id")).toBe("boot-123");
  expect(requests[2]?.get("x-houston-if-generation-match")).toBe("8");
  expect(fence.token).toBe("42");
});

test("claim-backed mutations send claim headers instead of lease headers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "http-claim-object-store-"));
  const source = join(dir, "source.txt");
  writeFileSync(source, "hello");
  const requests: Headers[] = [];
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/v1/pod/store/acme/agent",
    token: "host-token",
    claim: {
      token: "claim-token",
      bootId: "claim-boot",
      conversationId: "mission-7",
    },
    fetchImpl: async (_input, init) => {
      requests.push(new Headers(init?.headers));
      return init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : Response.json(metadata("notes.txt", 5));
    },
  });

  await store.upload(source, "notes.txt");
  await store.delete("notes.txt");

  for (const headers of requests) {
    expect(headers.get("x-houston-claim-token")).toBe("claim-token");
    expect(headers.get("x-houston-claim-boot")).toBe("claim-boot");
    expect(headers.get("x-houston-claim-conversation")).toBe("mission-7");
    expect(headers.get("x-houston-fencing-token")).toBeNull();
    expect(headers.get("x-houston-boot-id")).toBeNull();
  }
});

test("claim and lease mutation authority cannot be configured together", () => {
  expect(
    () =>
      new HttpObjectStore({
        baseUrl: "https://store.test/base",
        token: "host-token",
        bootId: "lease-boot",
        fence: {},
        claim: {
          token: "claim-token",
          bootId: "claim-boot",
          conversationId: "mission-7",
        },
      }),
  ).toThrow("claim authority cannot be combined");
});

test.each([
  409, 500,
])("does not capture a fencing token from a failed %i response", async (status) => {
  const fence = { token: "41" };
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "pod-token",
    bootId: "boot-123",
    fence,
    fetchImpl: async () =>
      new Response("rejected", {
        status,
        headers: { "X-Houston-Fencing-Token": "99" },
      }),
    retryDelaysMs: [],
  });

  await expect(store.manifest()).rejects.toThrow(`failed (${status})`);
  expect(fence.token).toBe("41");
});

test("keeps old-gateway writes free of fencing and precondition headers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "http-unfenced-object-store-"));
  const source = join(dir, "source.txt");
  writeFileSync(source, "hello");
  let headers = new Headers();
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "pod-token",
    bootId: "boot-123",
    fence: {},
    fetchImpl: async (_input, init) => {
      headers = new Headers(init?.headers);
      return Response.json(metadata("notes.txt", 5));
    },
  });

  await store.upload(source, "notes.txt");

  expect(Object.fromEntries(headers)).toEqual({
    authorization: "Bearer pod-token",
  });
});

test("uses the generation response header when the PUT body has no gen", async () => {
  const dir = mkdtempSync(join(tmpdir(), "http-generation-header-"));
  const source = join(dir, "source.txt");
  writeFileSync(source, "hello");
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "pod-token",
    fetchImpl: async () =>
      Response.json(metadata("notes.txt", 5), {
        headers: { "X-Houston-Generation": "9223372036854775806" },
      }),
  });

  await expect(store.upload(source, "notes.txt")).resolves.toEqual({
    generation: "9223372036854775806",
  });
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

test("retries a fenced unconditional PUT after a transient response", async () => {
  const dir = mkdtempSync(join(tmpdir(), "http-fenced-retry-"));
  const source = join(dir, "source.txt");
  writeFileSync(source, "hello");
  const put = flaky([new Response("bad gateway", { status: 502 })], () =>
    Response.json(metadata("file.txt", 5)),
  );
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "pod-token",
    bootId: "boot-123",
    fence: { token: "41" },
    fetchImpl: put.fetchImpl,
    retryDelaysMs: [0, 0],
  });

  await expect(store.upload(source, "file.txt")).resolves.toBeUndefined();
  expect(put.calls()).toBe(2);
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

test("versioned download returns the object generation header", async () => {
  const dir = mkdtempSync(join(tmpdir(), "http-object-store-versioned-"));
  const destination = join(dir, "dest.txt");
  const store = retryStore(
    async () =>
      new Response("payload", {
        headers: { "X-Houston-Generation": "17" },
      }),
  );

  await expect(
    store.downloadVersioned("file.txt", destination),
  ).resolves.toEqual({ generation: "17" });
  expect(readFileSync(destination, "utf8")).toBe("payload");
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

test.each([
  [409, StoreFencedError],
  [412, StoreConflictError],
] as const)("a %i write response surfaces its typed store error", async (status, ErrorType) => {
  const dir = mkdtempSync(join(tmpdir(), "houston-store-write-error-"));
  const source = join(dir, "notes.txt");
  writeFileSync(source, "notes");
  const store = new HttpObjectStore({
    baseUrl: "https://gw.test/v1/pod/store/o/a",
    token: "pod-token",
    fetchImpl: async () => new Response("rejected", { status }),
    retryDelaysMs: [0, 0],
  });

  const err = await store
    .upload(source, "work/notes.txt", { ifGenerationMatch: "3" })
    .then(() => null)
    .catch((error: unknown) => error);

  expect(err).toBeInstanceOf(ErrorType);
  expect((err as StoreFencedError | StoreConflictError).key).toBe(
    "work/notes.txt",
  );
});

test("does not retry a conditional PUT after a transient response", async () => {
  const dir = mkdtempSync(join(tmpdir(), "houston-store-conditional-"));
  const source = join(dir, "notes.txt");
  writeFileSync(source, "notes");
  let calls = 0;
  const store = new HttpObjectStore({
    baseUrl: "https://gw.test/v1/pod/store/o/a",
    token: "pod-token",
    fetchImpl: async () => {
      calls += 1;
      return new Response("gateway unavailable", { status: 502 });
    },
    retryDelaysMs: [0, 0],
  });

  await expect(
    store.upload(source, "work/notes.txt", { ifGenerationMatch: "3" }),
  ).rejects.toThrow("failed (502)");
  expect(calls).toBe(1);
});

test("a large file uploads as a per-attempt stream, never one heap buffer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "houston-store-stream-"));
  const big = join(dir, "big.mp4");
  writeFileSync(big, "V".repeat(STREAM_UPLOAD_THRESHOLD_BYTES));
  const received: number[] = [];
  let calls = 0;
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    calls += 1;
    expect((init as { duplex?: string }).duplex).toBe("half");
    expect(init?.body).toBeInstanceOf(ReadableStream);
    // Drain the stream — a retried attempt must deliver the FULL body again,
    // which only works if each attempt opened a fresh stream.
    let bytes = 0;
    for await (const chunk of init?.body as ReadableStream<Uint8Array>) {
      bytes += chunk.byteLength;
    }
    received.push(bytes);
    if (calls === 1) return Response.json({ error: "bad gw" }, { status: 503 });
    return Response.json(metadata("work/big.mp4", bytes));
  }) as unknown as typeof fetch;
  const store = new HttpObjectStore({
    baseUrl: "https://gw.test/v1/pod/store/o/a",
    token: "pod-token",
    fetchImpl,
    retryDelaysMs: [0],
  });

  await store.upload(big, "work/big.mp4");
  expect(received).toEqual([
    STREAM_UPLOAD_THRESHOLD_BYTES,
    STREAM_UPLOAD_THRESHOLD_BYTES,
  ]);
});

test("a small file still uploads as a single buffered body", async () => {
  const dir = mkdtempSync(join(tmpdir(), "houston-store-small-"));
  writeFileSync(join(dir, "notes.txt"), "small");
  let body: unknown;
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    body = init?.body;
    return Response.json(metadata("notes.txt", 5));
  }) as unknown as typeof fetch;
  const store = new HttpObjectStore({
    baseUrl: "https://gw.test/v1/pod/store/o/a",
    token: "pod-token",
    fetchImpl,
  });
  await store.upload(join(dir, "notes.txt"), "notes.txt");
  expect(Buffer.isBuffer(body)).toBe(true);
});
