import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { config } from "../config";
import { reportMissionSettle } from "./mission-settle";

/**
 * The settle report crosses the pod↔control-plane network, whose drops are
 * connectivity, not Houston faults (Sentry HOUSTON-APP-595: 225 undici
 * `TypeError: fetch failed` events, every one a socket reset mid-settle).
 * The contract under test: transient failures RETRY (the host applies at most
 * one settle per mission, so replays are safe), and a settle that still fails
 * logs a WARN breadcrumb — never a console.error, which the capture feed
 * would mint into a Sentry error event.
 */

const prev = { url: "", token: "" };
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  prev.url = config.controlPlaneUrl;
  prev.token = config.sandboxToken;
  config.controlPlaneUrl = "http://control-plane.test";
  config.sandboxToken = "sbx-token";
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  config.controlPlaneUrl = prev.url;
  config.sandboxToken = prev.token;
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

/** Fire-and-forget returns void; drain its internal promise chain. */
async function settled(check: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    expect(check()).toBe(true);
  });
}

test("posts the settle payload with the sandbox bearer", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status: 200 });
  };

  reportMissionSettle("conv-1", "needs_you", null, { fetchImpl });
  await settled(() => calls.length === 1);

  expect(calls[0]?.url).toBe(
    "http://control-plane.test/sandbox/missions/settle",
  );
  const headers = calls[0]?.init.headers as Record<string, string>;
  expect(headers.authorization).toBe("Bearer sbx-token");
  expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
    conversation_id: "conv-1",
    status: "needs_you",
    pending_interaction: null,
  });
  expect(warnSpy).not.toHaveBeenCalled();
  expect(errorSpy).not.toHaveBeenCalled();
});

test("a transient network drop retries and succeeds silently", async () => {
  let attempts = 0;
  const fetchImpl: typeof fetch = async () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError("fetch failed");
    return new Response(null, { status: 200 });
  };

  reportMissionSettle("conv-2", "error", null, {
    fetchImpl,
    retryDelaysMs: [0, 0],
  });
  await settled(() => attempts === 2);

  expect(warnSpy).not.toHaveBeenCalled();
  expect(errorSpy).not.toHaveBeenCalled();
});

test("a settle that fails every attempt logs WARN, never console.error", async () => {
  let attempts = 0;
  const fetchImpl: typeof fetch = async () => {
    attempts += 1;
    throw new TypeError("fetch failed");
  };

  reportMissionSettle("conv-3", "error", null, {
    fetchImpl,
    retryDelaysMs: [0, 0],
  });
  await settled(() => warnSpy.mock.calls.length === 1);

  expect(attempts).toBe(3);
  expect(String(warnSpy.mock.calls[0]?.[0])).toContain("conv-3");
  expect(errorSpy).not.toHaveBeenCalled();
});

test("no control plane configured means no request at all", async () => {
  config.controlPlaneUrl = "";
  let attempts = 0;
  const fetchImpl: typeof fetch = async () => {
    attempts += 1;
    return new Response(null, { status: 200 });
  };

  reportMissionSettle("conv-4", "needs_you", null, { fetchImpl });
  await new Promise((resolve) => setImmediate(resolve));

  expect(attempts).toBe(0);
});
