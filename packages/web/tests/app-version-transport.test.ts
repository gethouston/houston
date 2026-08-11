import { afterEach, expect, test, vi } from "vitest";
import { gatewayAuthFetch } from "../src/engine-adapter/control-plane";

/**
 * Build identity, transport half: gatewayAuthFetch must attach
 * `X-Houston-App-Version` on every request when the desktop shell installed
 * `window.__HOUSTON_APP_VERSION__`. The global never exists on web — then no
 * header is sent (which is what keeps web fetches preflight-free).
 */

const originalFetch = globalThis.fetch;
type AppVersionWindow = {
  __HOUSTON_APP_VERSION__?: string;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as { window?: unknown }).window;
  vi.clearAllMocks();
});

/** Simulate the desktop shell's globals (no jsdom here — tests run in node). */
function installWindow(w: AppVersionWindow) {
  (globalThis as { window?: AppVersionWindow }).window = w;
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
