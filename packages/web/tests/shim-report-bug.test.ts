import { afterEach, expect, test, vi } from "vitest";
import { invoke } from "../src/shims/tauri-core";

/**
 * HOU-818: in cloud mode the web build files bug reports through the gateway's
 * `POST /feedback`. It used to do that with a raw fetch pinning
 * `Authorization: Bearer <token captured at boot>`, so a report typed after the
 * tab idled past token expiry died on a 401 the user only saw as a generic
 * "couldn't send" toast. It now rides the same `gatewayAuthFetch` transport as
 * every other control-plane call: live bearer, one single-flight refresh +
 * replay on 401, and the build-identity header. NOT the active-space header:
 * feedback must survive a stale space selector.
 */

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

/** Stub fetch with a queue of responses; records every (url, init) call. */
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
  // The gateway's ResolveOrg 403s `not_member` on a stale selector and
  // `/feedback` never reads the org, so sending `x-houston-org` would gag
  // exactly the user who was just removed from their team.
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
  // No bearer yet → the transport asks the refresher BEFORE sending, so no
  // unauthenticated request goes out at all and the single attempt already
  // carries the minted token (HOU-1014).
  expect(calls.map((c) => bearer(c.init))).toEqual(["Bearer minted"]);
});

test("report_bug fails as quiet signed-out when the refresher declares the session gone", async () => {
  // Refresher installed and answering null = terminal sign-out: the sign-in
  // screen is the surface, so the failure carries the recognized signed_out
  // marker instead of the gateway's raw reason (HOUSTON-APP-4WR).
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
