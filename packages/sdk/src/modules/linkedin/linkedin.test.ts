import { LINKEDIN_IMAGE_MAX_BYTES } from "@houston/wire-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { checkLinkedInText, LinkedInCommand, LinkedInHttpError } from "./index";
import { LINKEDIN_POST_DEADLINE_MS } from "./post-deadline";
import { LINKEDIN_POST_BODY_MS } from "./post-outcome";

const BASE = "http://127.0.0.1:4317";
const AUTHORIZE =
  "https://www.linkedin.com/oauth/v2/authorization?response_type=code&state=s";
const POSTED = {
  postUrn: "urn:li:share:7",
  postUrl: "https://www.linkedin.com/feed/update/urn:li:share:7/",
};

interface Recorded {
  method: string;
  url: string;
  body: string | FormData | null;
}

const NO_CLOCK = { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} };

function makeSdk(
  answer: (call: Recorded) => Response | Promise<Response>,
  clock: SdkPorts["clock"] = NO_CLOCK,
) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body;
      const call: Recorded = {
        method: init?.method ?? "GET",
        url: String(input),
        body:
          typeof body === "string" || body instanceof FormData ? body : null,
      };
      calls.push(call);
      return answer(call);
    },
  );
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(new Map()),
    devicePreferences: memoryKv(),
    clock,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls };
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const refusal = (status: number, code: string, headers: HeadersInit = {}) =>
  json({ code, error: "message" }, status, headers);
const png = (size = 4) =>
  new Blob([new Uint8Array(size)], { type: "image/png" });

describe("the linkedin requests", () => {
  it("reads the connection off GET /v1/linkedin/connection", async () => {
    const answer = {
      connected: true,
      name: "Ada",
      expiresAt: "2026-12-01T00:00:00Z",
    };
    const { sdk, calls } = makeSdk(() => json(answer));
    expect(await sdk.linkedin.connection()).toEqual(answer);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/linkedin/connection`, body: null },
    ]);
  });

  it("mints LinkedIn's authorization page with an empty JSON body on the web", async () => {
    const { sdk, calls } = makeSdk(() => json({ authorizeUrl: AUTHORIZE }));
    expect(await sdk.linkedin.connect()).toEqual({
      url: AUTHORIZE,
      accepted: null,
    });
    expect(calls).toEqual([
      { method: "POST", url: `${BASE}/v1/linkedin/connect`, body: "{}" },
    ]);
  });

  it("names the desktop's loopback return, and asks once for app when it is refused", async () => {
    const answers = [
      json({ code: "invalid_request", error: "bad return" }, 400),
      json({ authorizeUrl: AUTHORIZE }),
    ];
    const { sdk, calls } = makeSdk(() => answers.shift() as Response);
    const state = "q9X-_3abcDEF4567";
    expect(
      await sdk.linkedin.connect({ kind: "loopback", port: 50123, state }),
    ).toEqual({ url: AUTHORIZE, accepted: "app" });
    expect(calls.map((c) => c.body)).toEqual([
      `{"return":"loopback","port":50123,"state":"${state}"}`,
      '{"return":"app"}',
    ]);
  });

  it("redeems the callback's ticket, and types a refused one as invalid", async () => {
    const connection = {
      connected: true,
      name: "Ada",
      expiresAt: "2026-12-01T00:00:00Z",
    };
    const ok = makeSdk(() => json(connection));
    expect(await ok.sdk.linkedin.complete("Tk7-ticket.value_~9")).toEqual({
      kind: "connected",
      connection,
    });
    expect(ok.calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/v1/linkedin/connect/complete`,
        body: '{"ticket":"Tk7-ticket.value_~9"}',
      },
    ]);
    const refused = makeSdk(() => json({ code: "invalid", error: "x" }, 404));
    expect(await refused.sdk.linkedin.complete("Tk7-ticket")).toEqual({
      kind: "invalid",
    });
    const failing = makeSdk(() => json({ error: "boom" }, 500));
    await expect(failing.sdk.linkedin.complete("Tk7-ticket")).rejects.toThrow();
  });

  it("refuses an authorization page that is not LinkedIn's", async () => {
    const { sdk } = makeSdk(() =>
      json({ authorizeUrl: "https://evil.example/oauth/v2/authorization" }),
    );
    await expect(sdk.linkedin.connect()).rejects.toThrow();
  });

  it("never completes a connection by reading it", async () => {
    const { sdk, calls } = makeSdk(() => json({ connected: false }));
    await sdk.linkedin.connection();
    expect(calls.map((c) => c.url)).toEqual([`${BASE}/v1/linkedin/connection`]);
  });

  it("disconnects with DELETE /v1/linkedin/connection", async () => {
    const { sdk, calls } = makeSdk(() => new Response(null, { status: 204 }));
    await sdk.linkedin.disconnect();
    expect(calls).toEqual([
      { method: "DELETE", url: `${BASE}/v1/linkedin/connection`, body: null },
    ]);
  });

  it("throws a LinkedInHttpError carrying the status when not configured", async () => {
    const { sdk } = makeSdk(() => refusal(503, "not_configured"));
    const error = await sdk.linkedin.connection().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinkedInHttpError);
    expect((error as LinkedInHttpError).status).toBe(503);
  });
});

describe("postImage", () => {
  it("posts multipart image, trimmed text and alt text", async () => {
    const { sdk, calls } = makeSdk(() => json(POSTED, 201));
    await expect(
      sdk.linkedin.postImage({
        image: png(),
        text: "  Hi  ",
        altText: "Chart",
      }),
    ).resolves.toEqual({ kind: "posted", ...POSTED });
    const form = calls[0].body as FormData;
    expect([...form.keys()]).toEqual(["image", "text", "altText"]);
    expect(form.get("text")).toBe("Hi");
    expect((form.get("image") as File).name).toBe("org-chart.png");
  });

  it("drops control characters a paste carried, keeping line breaks and tabs", async () => {
    const { sdk, calls } = makeSdk(() => json(POSTED, 201));
    await sdk.linkedin.postImage({ image: png(), text: "A\u0007\tB\nC\u0000" });
    expect((calls[0].body as FormData).get("text")).toBe("A\tB\nC");
  });

  it("names a JPEG for what it is and leaves out an empty alt text", async () => {
    const { sdk, calls } = makeSdk(() => json(POSTED, 201));
    const jpeg = new Blob([new Uint8Array(4)], { type: "image/jpeg" });
    await sdk.linkedin.postImage({ image: jpeg, text: "Hi", altText: " " });
    const form = calls[0].body as FormData;
    expect([...form.keys()]).toEqual(["image", "text"]);
    expect((form.get("image") as File).name).toBe("org-chart.jpg");
  });

  it.each([
    ["empty words", { image: png(), text: "   " }, "invalid_text"],
    [
      "too many words",
      { image: png(), text: "x".repeat(3001) },
      "invalid_text",
    ],
    [
      "words that pass 3000 only once escaped",
      { image: png(), text: "#_".repeat(751) },
      "invalid_text",
    ],
    [
      "a picture of another type",
      { image: new Blob(["x"], { type: "image/gif" }), text: "Hi" },
      "unsupported_media_type",
    ],
    [
      "a picture over the cap",
      { image: png(LINKEDIN_IMAGE_MAX_BYTES + 1), text: "Hi" },
      "image_too_large",
    ],
  ])("refuses %s before any request", async (_, input, code) => {
    const { sdk, calls } = makeSdk(() => json(POSTED, 201));
    await expect(sdk.linkedin.postImage(input)).resolves.toEqual({
      kind: "refused",
      code,
    });
    expect(calls).toHaveLength(0);
  });

  it("counts characters, not UTF-16 units", async () => {
    const { sdk } = makeSdk(() => json(POSTED, 201));
    const text = "🙂".repeat(3000);
    await expect(
      sdk.linkedin.postImage({ image: png(), text }),
    ).resolves.toEqual({ kind: "posted", ...POSTED });
  });

  it("takes words exactly 3000 long once escaped", async () => {
    const { sdk, calls } = makeSdk(() => json(POSTED, 201));
    const text = `${"@".repeat(1000)}${"x".repeat(1000)}`;
    await expect(
      sdk.linkedin.postImage({ image: png(), text }),
    ).resolves.toEqual({ kind: "posted", ...POSTED });
    // Sent as written: the gateway does the escaping.
    expect((calls[0].body as FormData).get("text")).toBe(text);
  });

  it("says by how much words run over once escaped", () => {
    expect(checkLinkedInText("  ")).toEqual({ kind: "empty" });
    expect(checkLinkedInText("Hi #team")).toEqual({ kind: "ok" });
    expect(checkLinkedInText("(".repeat(1501))).toEqual({
      kind: "tooLong",
      over: 2,
    });
  });

  it.each([
    [409, "linkedin_not_connected"],
    [502, "linkedin_failed"],
    [503, "not_configured"],
    [400, "invalid_aspect_ratio"],
    [413, "image_too_large"],
  ])("types a %i %s as a refusal", async (status, code) => {
    const { sdk } = makeSdk(() => refusal(status, code));
    await expect(
      sdk.linkedin.postImage({ image: png(), text: "Hi" }),
    ).resolves.toEqual({ kind: "refused", code });
  });

  it("carries a 429's Retry-After", async () => {
    const { sdk } = makeSdk(() =>
      refusal(429, "rate_limited", { "Retry-After": "120" }),
    );
    await expect(
      sdk.linkedin.postImage({ image: png(), text: "Hi" }),
    ).resolves.toEqual({
      kind: "refused",
      code: "rate_limited",
      retryAfterMs: 120_000,
    });
  });

  it.each([
    "The Internet connection appears to be offline.",
    "A server with the specified hostname could not be found.",
    "Could not connect to the server.",
  ])("answers offline when the request never left: %s", async (message) => {
    const { sdk } = makeSdk(() => {
      throw new TypeError(message);
    });
    await expect(
      sdk.linkedin.postImage({ image: png(), text: "Hi" }),
    ).resolves.toEqual({ kind: "refused", code: "offline" });
  });

  // The gateway may have taken the post before the connection broke.
  it.each([
    "The network connection was lost.",
    "Load failed",
    "Failed to fetch",
    "The request timed out.",
  ])("answers unknown when the connection broke after sending: %s", async (message) => {
    const { sdk } = makeSdk(() => {
      throw new TypeError(message);
    });
    await expect(
      sdk.linkedin.postImage({ image: png(), text: "Hi" }),
    ).resolves.toEqual({ kind: "unknown" });
  });

  it.each([
    [504, ""],
    [502, "<html>bad gateway</html>"],
    [502, JSON.stringify({ code: "upstream_reset" })],
  ])("answers unknown for a proxy's bare %i", async (status, body) => {
    const { sdk } = makeSdk(() => new Response(body, { status }));
    await expect(
      sdk.linkedin.postImage({ image: png(), text: "Hi" }),
    ).resolves.toEqual({ kind: "unknown" });
  });

  it("keeps the gateway's own 502 linkedin_failed a refusal", async () => {
    const { sdk } = makeSdk(() => refusal(502, "linkedin_failed"));
    await expect(
      sdk.linkedin.postImage({ image: png(), text: "Hi" }),
    ).resolves.toEqual({ kind: "refused", code: "linkedin_failed" });
  });

  it("throws on a failure that is not a refusal", async () => {
    const failing = makeSdk(() => json({ error: "boom" }, 500));
    await expect(
      failing.sdk.linkedin.postImage({ image: png(), text: "Hi" }),
    ).rejects.toBeInstanceOf(LinkedInHttpError);
  });

  it("takes any 2xx as a post, with no link when its id is unreadable", async () => {
    const posted = { kind: "posted", postUrn: null, postUrl: null };
    for (const answer of [
      () => json({}, 201),
      () => json({ postUrl: "x" }, 201),
      () => new Response("", { status: 201 }),
      // The body stream dies after the 201: the post is still up.
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("stream reset"));
            },
          }),
          { status: 201 },
        ),
    ]) {
      const { sdk } = makeSdk(answer);
      await expect(
        sdk.linkedin.postImage({ image: png(), text: "Hi" }),
      ).resolves.toEqual(posted);
    }
  });

  describe("a 201 whose body stalls", () => {
    afterEach(() => vi.useRealTimers());

    it("is posted with no link, even past the deadline", async () => {
      vi.useFakeTimers();
      const clock: SdkPorts["clock"] = {
        now: () => Date.now(),
        setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
        clearTimeout: (id) => clearTimeout(id),
      };
      const { sdk } = makeSdk(async () => {
        // The headers come a moment before the deadline, the body never.
        await new Promise((r) => setTimeout(r, LINKEDIN_POST_DEADLINE_MS - 1));
        return new Response(new ReadableStream({ start() {} }), {
          status: 201,
        });
      }, clock);
      const aborts = vi.spyOn(AbortController.prototype, "abort");
      const result = sdk.linkedin.postImage({ image: png(), text: "Hi" });
      await vi.advanceTimersByTimeAsync(LINKEDIN_POST_DEADLINE_MS - 1);
      await vi.advanceTimersByTimeAsync(LINKEDIN_POST_BODY_MS);
      await expect(result).resolves.toEqual({
        kind: "posted",
        postUrn: null,
        postUrl: null,
      });
      // Only the stalled body was cut, once.
      expect(aborts).toHaveBeenCalledTimes(1);
      aborts.mockRestore();
    });
  });

  it("rejects with the abort when the caller aborts", async () => {
    const controller = new AbortController();
    const { sdk } = makeSdk(() => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await expect(
      sdk.linkedin.postImage({
        image: png(),
        text: "Hi",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("the linkedin commands", () => {
  it("dispatches a post with a picture, and refuses one without", async () => {
    const { sdk } = makeSdk(() => json(POSTED, 201));
    const posted = await sdk.dispatch({
      id: "1",
      type: LinkedInCommand.PostImage,
      payload: { image: png(), text: "Hi" },
    });
    expect(posted).toEqual({
      id: "1",
      ok: true,
      value: { kind: "posted", ...POSTED },
    });
    const refused = await sdk.dispatch({
      id: "2",
      type: LinkedInCommand.PostImage,
      payload: { image: "not a picture", text: "Hi" },
    });
    expect(refused).toMatchObject({ ok: false });
  });
});
