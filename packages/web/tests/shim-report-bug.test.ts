import { afterEach, expect, test, vi } from "vitest";
import { invoke } from "../src/shims/tauri-core";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
  globalThis.fetch = originalFetch;
});

function setCloudWindow(opts: {
  token: string;
  org?: string | null;
  appVersion?: string;
  refresh?: () => Promise<string | null>;
}): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __HOUSTON_CP__: true,
      __HOUSTON_ENGINE__: {
        baseUrl: "https://gateway.example",
        token: opts.token,
      },
      __HOUSTON_ACTIVE_ORG__: opts.org ?? null,
      __HOUSTON_APP_VERSION__: opts.appVersion,
      __HOUSTON_SESSION_REFRESH__: opts.refresh,
    },
  });
}

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch(...responses: Response[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
  return calls;
}

const bearer = (init: RequestInit | undefined) =>
  new Headers(init?.headers).get("Authorization");

test("report_bug posts the payload to the gateway and returns the issue id", async () => {
  setCloudWindow({ token: "live-token", org: "0123456789abcdef" });
  const calls = stubFetch(json(200, { id: "HOU-1" }));

  const id = await invoke<string | null>("report_bug", {
    payload: { command: "manual_report", error: "boom" },
  });

  expect(id).toBe("HOU-1");
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://gateway.example/feedback");
  expect(calls[0].init?.method).toBe("POST");
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({
    command: "manual_report",
    error: "boom",
  });
});

test("report_bug carries the live bearer and the build header", async () => {
  setCloudWindow({
    token: "live-token",
    org: "0123456789abcdef",
    appVersion: "0.5.9+cloud",
  });
  const calls = stubFetch(json(200, { id: null }));

  await invoke("report_bug", { payload: {} });

  const headers = new Headers(calls[0].init?.headers);
  expect(headers.get("Authorization")).toBe("Bearer live-token");
  expect(headers.get("X-Houston-App-Version")).toBe("0.5.9+cloud");
  expect(headers.get("Content-Type")).toBe("application/json");
});

test("report_bug never pins the active space, even with one selected", async () => {
  setCloudWindow({ token: "live-token", org: "0123456789abcdef" });
  const calls = stubFetch(json(200, { id: "HOU-4" }));

  await invoke("report_bug", { payload: {} });

  expect(new Headers(calls[0].init?.headers).get("x-houston-org")).toBeNull();
});

test("report_bug refreshes and replays once on a 401", async () => {
  setCloudWindow({
    token: "stale",
    refresh: async () => "fresh",
  });
  const calls = stubFetch(
    json(401, { error: "unauthorized" }),
    json(200, {
      id: "HOU-2",
    }),
  );

  const id = await invoke<string | null>("report_bug", { payload: {} });

  expect(id).toBe("HOU-2");
  expect(calls.map((c) => bearer(c.init))).toEqual([
    "Bearer stale",
    "Bearer fresh",
  ]);
});

test("report_bug with no token yet still reaches the gateway after a refresh", async () => {
  setCloudWindow({ token: "", refresh: async () => "minted" });
  const calls = stubFetch(
    json(200, {
      id: "HOU-3",
    }),
  );

  const id = await invoke<string | null>("report_bug", { payload: {} });

  expect(id).toBe("HOU-3");
  expect(calls.map((c) => bearer(c.init))).toEqual(["Bearer minted"]);
});

test("report_bug fails as quiet signed-out when the refresher declares the session gone", async () => {
  setCloudWindow({ token: "stale", refresh: async () => null });
  stubFetch(json(401, { error: "session expired" }));

  await expect(invoke("report_bug", { payload: {} })).rejects.toThrow(
    "signed_out",
  );
});

test("report_bug surfaces the gateway's reason when there is no refresher to consult", async () => {
  setCloudWindow({ token: "stale" });
  stubFetch(json(401, { error: "session expired" }));

  await expect(invoke("report_bug", { payload: {} })).rejects.toThrow(
    "session expired",
  );
});

test("report_bug falls back to the status when the gateway sends no reason", async () => {
  setCloudWindow({ token: "live-token" });
  stubFetch(new Response("nope", { status: 501 }));

  await expect(invoke("report_bug", { payload: {} })).rejects.toThrow(
    "feedback failed (501)",
  );
});

test("report_bug rethrows the gateway's intake refusal typed", async () => {
  setCloudWindow({ token: "live-token" });
  stubFetch(
    json(503, {
      error: "Linear API returned GraphQL errors: usage limit exceeded",
      code: "intake_unavailable",
    }),
  );

  const err = await invoke("report_bug", { payload: {} }).catch(
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  expect(err).toMatchObject({
    kind: "intake_unavailable",
    status: 503,
    message: "Linear API returned GraphQL errors: usage limit exceeded",
  });
});

test("report_bug types any other refusal as other", async () => {
  setCloudWindow({ token: "live-token" });
  stubFetch(json(503, { error: "feedback intake not configured" }));

  await expect(invoke("report_bug", { payload: {} })).rejects.toMatchObject({
    kind: "other",
    status: 503,
    message: "feedback intake not configured",
  });
});

test("report_bug outside cloud mode stays a desktop-only action", async () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __HOUSTON_ENGINE__: { baseUrl: "https://host.example", token: "" },
    },
  });
  stubFetch();

  await expect(invoke("report_bug", { payload: {} })).rejects.toThrow(
    /desktop-only/,
  );
});
