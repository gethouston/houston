import { afterEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";

/**
 * `houston_onboarding_segment` is an ACCOUNT_PREF_KEY (config-prefs-mixin.ts):
 * in hosted/cloud mode it must round-trip through the host's
 * `/v1/preferences/:key`, not this browser's localStorage, so the
 * segmentation question is answered once per account, not once per device.
 */

const PREF_PATH = "/v1/preferences/houston_onboarding_segment";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function stubFetch(...responses: Response[]): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
  return calls;
}

function hostedClient() {
  return new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
}

test("hosted getPreference reads the segment from the control plane", async () => {
  const calls = stubFetch(json(200, { value: "marketing" }));

  await expect(
    hostedClient().getPreference("houston_onboarding_segment"),
  ).resolves.toBe("marketing");

  expect(calls[0].url).toBe(`http://host${PREF_PATH}`);
});

test("hosted setPreference writes the segment to the control plane", async () => {
  const calls = stubFetch(json(200, { value: "operations" }));

  await hostedClient().setPreference(
    "houston_onboarding_segment",
    "operations",
  );

  expect(calls[0].url).toBe(`http://host${PREF_PATH}`);
  expect((calls[0].init?.method ?? "GET").toUpperCase()).toBe("PUT");
  expect(calls[0].init?.body).toBe(JSON.stringify({ value: "operations" }));
});

test("hosted setPreference does not swallow a control-plane failure", async () => {
  stubFetch(json(500, { error: "boom" }));

  await expect(
    hostedClient().setPreference("houston_onboarding_segment", "operations"),
  ).rejects.toThrow();
});
