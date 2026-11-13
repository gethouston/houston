import { expect, test } from "vitest";
import { HttpObjectStore } from "./http-store";
import { StoreFencedError } from "./object-store";
import { PrefetchedObjectStore } from "./prefetched-store";
import { UploadCopyExistsError } from "./upload-store";

test.each([
  "lease",
  "claim",
])("copies the exact generation under %s authority without retrying a lost response", async (authority) => {
  const requests: { url: string; headers: Headers; body: unknown }[] = [];
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/v1/pod/store/org/agent/",
    token: "pod",
    ...(authority === "lease"
      ? { bootId: "boot", fence: { token: "41" } }
      : {
          claim: { token: "claim", bootId: "worker", conversationId: "conv" },
        }),
    fetchImpl: async (input, init) => {
      requests.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({
        key: "workspaces/main/agent/uploads/report.pdf",
        generation: "9223372036854775806",
        size: 19,
      });
    },
  });
  const copied = await store.copyUpload(
    "opaque_upload_id_123",
    "workspaces/main/agent/uploads/report.pdf",
    "9223372036854775805",
  );
  expect(copied).toEqual({
    key: "workspaces/main/agent/uploads/report.pdf",
    generation: "9223372036854775806",
    size: 19,
  });
  expect(requests[0]?.url).toBe(
    "https://store.test/v1/pod/store/org/agent/uploads/opaque_upload_id_123/copy",
  );
  expect(requests[0]?.body).toEqual({
    key: copied.key,
    generation: "9223372036854775805",
  });
  expect(requests[0]?.headers.get("authorization")).toBe("Bearer pod");
  if (authority === "lease") {
    expect(requests[0]?.headers.get("x-houston-fencing-token")).toBe("41");
    expect(requests[0]?.headers.get("x-houston-boot-id")).toBe("boot");
  } else {
    expect(requests[0]?.headers.get("x-houston-claim-token")).toBe("claim");
    expect(requests[0]?.headers.get("x-houston-claim-boot")).toBe("worker");
    expect(requests[0]?.headers.get("x-houston-claim-conversation")).toBe(
      "conv",
    );
  }
});

test("staged reads use pod auth and exact generation without mutation headers", async () => {
  let seen = "";
  let headers = new Headers();
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "pod",
    bootId: "boot",
    fence: { token: "41" },
    fetchImpl: async (url, init) => {
      seen = String(url);
      headers = new Headers(init?.headers);
      return new Response("zip");
    },
  });
  expect(
    (await store.readUpload("opaque_upload_id_123", "19")).toString(),
  ).toBe("zip");
  expect(seen).toBe(
    "https://store.test/base/uploads/opaque_upload_id_123?generation=19",
  );
  expect(Object.fromEntries(headers)).toEqual({ authorization: "Bearer pod" });
});

test("copy refuses malformed responses and makes one attempt on a transient failure", async () => {
  let calls = 0;
  const store = new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "pod",
    retryDelaysMs: [0, 0],
    fetchImpl: async () => {
      calls++;
      return new Response("unavailable", { status: 503 });
    },
  });
  await expect(
    store.copyUpload("opaque_upload_id_123", "key", "2"),
  ).rejects.toThrow("failed (503)");
  expect(calls).toBe(1);
  const malformed = new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "pod",
    fetchImpl: async () =>
      Response.json({ key: "other", size: 5, generation: "5" }),
  });
  await expect(
    malformed.copyUpload("opaque_upload_id_123", "key", "2"),
  ).rejects.toThrow("malformed body");
});

test("prefetched stores forward staged operations to the live store", async () => {
  const inner = new HttpObjectStore({
    baseUrl: "https://store.test/base",
    token: "pod",
    fetchImpl: async (_url, init) =>
      init?.method === "POST"
        ? Response.json({ key: "key", size: 3, generation: "4" })
        : new Response("zip"),
  });
  const prefetched = new PrefetchedObjectStore(inner, {
    manifest: [],
    objects: new Map(),
  });
  expect(
    await prefetched.copyUpload?.("opaque_upload_id_123", "key", "2"),
  ).toEqual({ key: "key", size: 3, generation: "4" });
  expect(
    (await prefetched.readUpload?.("opaque_upload_id_123", "2"))?.toString(),
  ).toBe("zip");
});

test("copy distinguishes an occupied destination from a rejected writer", async () => {
  for (const [code, ErrorType] of [
    ["exists", UploadCopyExistsError],
    ["fenced", StoreFencedError],
  ] as const) {
    const store = new HttpObjectStore({
      baseUrl: "https://store.test/base",
      token: "pod",
      fetchImpl: async () =>
        Response.json({ error: code, code }, { status: 409 }),
    });
    await expect(
      store.copyUpload("opaque_upload_id_123", "key", "2"),
    ).rejects.toBeInstanceOf(ErrorType);
  }
});
