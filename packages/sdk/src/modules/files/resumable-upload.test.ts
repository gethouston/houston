import { describe, expect, it, vi } from "vitest";
import type { SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import type { UploadProgress } from "./types";

const CHUNK = 256 * 1024;
const SESSION = {
  uploadId: "upload_session_0001",
  uploadUrl: "/v1/sink",
  chunkBytes: CHUNK,
  expiresAt: "2026-11-14T00:00:00Z",
};
const opts = { name: "file.bin", purpose: "attachment" as const };

function setup(
  answers: Array<
    Response | Error | ((init?: RequestInit) => Promise<Response>)
  >,
  open?: typeof fetch,
) {
  const requests: RequestInit[] = [];
  const pauses: number[] = [];
  const progress: UploadProgress[] = [];
  const fetchOpen = open ?? vi.fn(async () => Response.json(SESSION));
  const rawFetch = vi.fn(
    async (_url: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      const answer = answers.shift();
      if (!answer) throw new Error("No sink response queued");
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(init) : answer;
    },
  );
  const clearTimeout = vi.fn();
  const ports: SdkPorts = {
    fetch: fetchOpen,
    rawFetch,
    random: () => 0.5,
    clock: {
      now: () => 0,
      setTimeout: (fn, ms) => {
        pauses.push(ms);
        queueMicrotask(fn);
        return 1;
      },
      clearTimeout,
    },
    storage: memoryKv(),
    devicePreferences: memoryKv(),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const sdk = new HoustonSdk({
    baseUrl: "https://host",
    reactivity: false,
    ports,
  });
  return {
    sdk,
    ports,
    requests,
    rawFetch,
    fetchOpen,
    pauses,
    progress,
    clearTimeout,
    onProgress: (p: UploadProgress) => progress.push(p),
  };
}

const incomplete = (offset: number, bare = false) =>
  new Response(null, {
    status: bare ? 308 : 200,
    headers: {
      ...(bare ? {} : { "X-HTTP-Status-Code-Override": "308" }),
      ...(offset ? { Range: `bytes=0-${offset - 1}` } : {}),
    },
  });
const blob = () =>
  new Blob([new Uint8Array(CHUNK * 2 + 3).map((_, i) => i % 251)]);

describe("resumable transfer", () => {
  it("queries after a lost chunk and re-slices from the persisted offset", async () => {
    const s = setup([
      incomplete(CHUNK),
      new TypeError("Failed to fetch"),
      incomplete(CHUNK * 2),
      new Response(null, { status: 201 }),
    ]);
    const file = blob();
    await expect(
      s.sdk.files.upload("a 1", file, { ...opts, onProgress: s.onProgress }),
    ).resolves.toEqual({ uploadId: SESSION.uploadId });
    expect(s.pauses).toEqual([500]);
    expect(
      s.requests.map((r) => new Headers(r.headers).get("Content-Range")),
    ).toEqual([
      `bytes 0-${CHUNK - 1}/${file.size}`,
      `bytes ${CHUNK}-${CHUNK * 2 - 1}/${file.size}`,
      `bytes */${file.size}`,
      `bytes ${CHUNK * 2}-${file.size - 1}/${file.size}`,
    ]);
    expect(await new Response(s.requests[3].body).arrayBuffer()).toEqual(
      await file.slice(CHUNK * 2).arrayBuffer(),
    );
    expect(
      s.requests.every(
        (r) =>
          r.credentials === "omit" &&
          !new Headers(r.headers).has("Authorization"),
      ),
    ).toBe(true);
    expect(
      s.requests.every(
        (r) => new Headers(r.headers).get("X-GUploader-No-308") === "yes",
      ),
    ).toBe(true);
    expect(s.progress.map((p) => [p.phase, p.sentBytes])).toEqual([
      ["uploading", 0],
      ["uploading", CHUNK],
      ["reconnecting", CHUNK],
      ["uploading", CHUNK * 2],
      ["uploading", file.size],
    ]);
  });

  it.each([
    404, 410,
  ])("reopens a %i session and restarts from byte zero", async (status) => {
    const s = setup([
      incomplete(CHUNK, true),
      new Response(null, { status }),
      incomplete(CHUNK),
      incomplete(CHUNK * 2),
      new Response(null),
    ]);
    await s.sdk.files.upload("a1", blob(), opts);
    expect(s.fetchOpen).toHaveBeenCalledTimes(2);
    expect(new Headers(s.requests[2].headers).get("Content-Range")).toBe(
      `bytes 0-${CHUNK - 1}/${blob().size}`,
    );
  });

  it.each([
    429, 500, 503,
  ])("queries before sending bytes after %i", async (status) => {
    const s = setup([
      new Response(null, { status }),
      incomplete(0),
      new Response(null),
    ]);
    await s.sdk.files.upload("a1", new Blob(["abc"]), opts);
    expect(s.pauses).toEqual([500]);
    expect(new Headers(s.requests[1].headers).get("Content-Range")).toBe(
      "bytes */3",
    );
    expect(await new Response(s.requests[1].body).arrayBuffer()).toHaveProperty(
      "byteLength",
      0,
    );
  });

  it("finishes from a status query when the final chunk's reply was lost", async () => {
    const s = setup([new TypeError("Failed to fetch"), new Response(null)]);
    await expect(
      s.sdk.files.upload("a1", new Blob(["abc"]), opts),
    ).resolves.toEqual({ uploadId: SESSION.uploadId });
    expect(s.requests).toHaveLength(2);
    expect(new Headers(s.requests[1].headers).get("Content-Range")).toBe(
      "bytes */3",
    );
  });

  it("bounds retries and session replacements", async () => {
    const s = setup(
      Array.from({ length: 25 }, () => new Response(null, { status: 500 })),
    );
    await expect(
      s.sdk.files.upload("a1", new Blob(["abc"]), opts),
    ).rejects.toMatchObject({ name: "UploadTransferError" });
    expect(s.pauses).toHaveLength(24);
    expect(Math.max(...s.pauses)).toBe(15000);
    const expired = setup(
      Array.from({ length: 3 }, () => new Response(null, { status: 410 })),
    );
    await expect(
      expired.sdk.files.upload("a1", new Blob(["abc"]), opts),
    ).rejects.toMatchObject({ name: "UploadTransferError" });
    expect(expired.fetchOpen).toHaveBeenCalledTimes(3);
  });

  it("aborts a pending clock backoff immediately", async () => {
    const s = setup([new Response(null, { status: 503 })]);
    const controller = new AbortController();
    s.ports.clock.setTimeout = vi.fn(() => {
      controller.abort();
      return 9;
    });
    await expect(
      s.sdk.files.upload("a1", new Blob(["abc"]), {
        ...opts,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(s.rawFetch).toHaveBeenCalledTimes(1);
  });

  it("aborts before opening and while a chunk is in flight", async () => {
    const controller = new AbortController();
    controller.abort("cancelled");
    const s = setup([]);
    await expect(
      s.sdk.files.upload("a1", new Blob(["abc"]), {
        ...opts,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(s.fetchOpen).not.toHaveBeenCalled();
    const inFlight = new AbortController();
    const live = setup([
      (init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
          inFlight.abort();
        }),
    ]);
    await expect(
      live.sdk.files.upload("a1", new Blob(["abc"]), {
        ...opts,
        signal: inFlight.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("keeps refusal codes and Retry-After on open", async () => {
    const s = setup([], async () =>
      Response.json(
        { error: "too many", code: "too_many_uploads" },
        { status: 429, headers: { "Retry-After": "4" } },
      ),
    );
    await expect(
      s.sdk.files.openUpload("a1", { ...opts, size: 1 }),
    ).rejects.toMatchObject({
      name: "UploadRefusalError",
      code: "too_many_uploads",
      retryAfterMs: 4000,
    });
  });

  it("memoizes an absent route per agent within the SDK", async () => {
    const s = setup(
      [],
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    for (const agentId of ["a1", "a1", "a2"]) {
      await expect(
        s.sdk.files.upload(agentId, new Blob(["abc"]), opts),
      ).rejects.toMatchObject({ name: "UploadSessionsUnavailableError" });
    }
    expect(s.fetchOpen).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed sessions and non-retryable sink errors", async () => {
    const malformed = setup([], async () => Response.json({ uploadId: "bad" }));
    await expect(
      malformed.sdk.files.openUpload("a1", { ...opts, size: 1 }),
    ).rejects.toMatchObject({ name: "UploadTransferError" });
    const refused = setup([new Response("no", { status: 403 })]);
    await expect(
      refused.sdk.files.upload("a1", new Blob(["abc"]), opts),
    ).rejects.toMatchObject({ status: 403 });
    expect(refused.pauses).toEqual([]);
  });
});
