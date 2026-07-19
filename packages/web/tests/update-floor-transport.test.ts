import { afterEach, expect, test, vi } from "vitest";
import { gatewayAuthFetch } from "../src/engine-adapter/control-plane";

/**
 * App-update floor, transport half: gatewayAuthFetch must (a) attach
 * `X-Houston-App-Version` on every request when the desktop shell installed
 * `window.__HOUSTON_APP_VERSION__`, and (b) forward a gateway
 * `426 Upgrade Required` to `window.__HOUSTON_UPDATE_REQUIRED__`. Neither
 * global exists on web — then no header is sent and a 426 just returns.
 */

const originalFetch = globalThis.fetch;
type FloorWindow = {
  __HOUSTON_APP_VERSION__?: string;
  __HOUSTON_UPDATE_REQUIRED__?: (signal: {
    minVersion: string | null;
    updateUrl: string | null;
  }) => void;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as { window?: unknown }).window;
  vi.clearAllMocks();
});

/** Simulate the desktop shell's globals (no jsdom here — tests run in node). */
function installWindow(w: FloorWindow) {
  (globalThis as { window?: FloorWindow }).window = w;
}

function stubFetch(response: Response) {
  const seen: { url: string; headers: Headers }[] = [];
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    seen.push({ url: String(input), headers: new Headers(init?.headers) });
    return response;
  }) as unknown as typeof fetch;
  return seen;
}

test("attaches X-Houston-App-Version when the desktop shell baked it", async () => {
  installWindow({ __HOUSTON_APP_VERSION__: "0.5.9+cloud" });
  const seen = stubFetch(new Response("{}", { status: 200 }));

  await gatewayAuthFetch("t")("https://gw.example/v1/capabilities");

  expect(seen[0].headers.get("X-Houston-App-Version")).toBe("0.5.9+cloud");
  expect(seen[0].headers.get("Authorization")).toBe("Bearer t");
});

test("sends no version header when the global is absent (web build)", async () => {
  const seen = stubFetch(new Response("{}", { status: 200 }));

  await gatewayAuthFetch("t")("https://gw.example/v1/capabilities");

  expect(seen[0].headers.get("X-Houston-App-Version")).toBeNull();
});

test("forwards a 426 body to the desktop update-required sink", async () => {
  const notify = vi.fn();
  installWindow({ __HOUSTON_UPDATE_REQUIRED__: notify });
  stubFetch(
    new Response(
      JSON.stringify({
        error: "app update required",
        minVersion: "0.6.0",
        updateUrl: "https://gethouston.ai/download",
      }),
      { status: 426 },
    ),
  );

  const res = await gatewayAuthFetch("t")("https://gw.example/v1/agents");

  // The caller keeps its normal error path — the response is returned as-is.
  expect(res.status).toBe(426);
  await vi.waitFor(() =>
    expect(notify).toHaveBeenCalledWith({
      minVersion: "0.6.0",
      updateUrl: "https://gethouston.ai/download",
    }),
  );
});

test("normalizes an empty updateUrl and a missing minVersion to null", async () => {
  const notify = vi.fn();
  installWindow({ __HOUSTON_UPDATE_REQUIRED__: notify });
  stubFetch(
    new Response(
      JSON.stringify({ error: "app update required", updateUrl: "" }),
      {
        status: 426,
      },
    ),
  );

  await gatewayAuthFetch("t")("https://gw.example/v1/agents");

  await vi.waitFor(() =>
    expect(notify).toHaveBeenCalledWith({ minVersion: null, updateUrl: null }),
  );
});

test("does not notify on non-426 responses", async () => {
  const notify = vi.fn();
  installWindow({ __HOUSTON_UPDATE_REQUIRED__: notify });
  stubFetch(new Response("{}", { status: 500 }));

  await gatewayAuthFetch("t")("https://gw.example/v1/agents");

  // Give the (nonexistent) fire-and-forget parse a tick to run.
  await new Promise((r) => setTimeout(r, 0));
  expect(notify).not.toHaveBeenCalled();
});
