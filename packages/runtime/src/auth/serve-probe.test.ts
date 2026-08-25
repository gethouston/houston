import { expect, test, vi } from "vitest";
import {
  describeProbeError,
  normalizeProbeDetail,
  PROBE_CONCURRENCY,
  probePath,
  probeProvider,
  probeProviders,
  type ServeProbe,
} from "./serve-probe";

/**
 * PRODUCT-1324 / HOUSTON-APP-4YV: runServedSync's ~40 unretried concurrent
 * probes turned one transient socket failure into a Sentry ERROR per provider
 * AND silently un-applied that provider for the sync. These pin the probe
 * layer's three defenses: one retry after a short backoff, a small concurrency
 * pool, and failure details that keep the undici `cause` code.
 */

const served = (id: string): ServeProbe => ({
  id,
  state: "served",
  cred: { provider: id, access: "AT", expires: 1, accountId: null },
});

const failed = (id: string, detail = "fetch failed"): ServeProbe => ({
  id,
  state: "error",
  detail,
});

test("a transient first failure is retried once and the retry's answer wins", async () => {
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    let calls = 0;
    const attempt = async (id: string) =>
      ++calls === 1
        ? failed(id, "fetch failed (cause: ECONNRESET)")
        : served(id);
    const probe = await probeProvider("openai-codex", attempt, 0);
    expect(probe.state).toBe("served");
    expect(calls).toBe(2);
    // The first failure is a WARN breadcrumb, never an error.
    expect(
      warns.mock.calls.some(
        (c) =>
          String(c[0]).includes("retrying once") &&
          String(c[0]).includes("ECONNRESET"),
      ),
    ).toBe(true);
  } finally {
    warns.mockRestore();
  }
});

test("a probe that fails both attempts is a final error (the retry's detail)", async () => {
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    let calls = 0;
    const attempt = async (id: string) => {
      calls++;
      return failed(id, "fetch failed (cause: ECONNREFUSED)");
    };
    const probe = await probeProvider("google", attempt, 0);
    expect(calls).toBe(2);
    expect(probe.state).toBe("error");
    if (probe.state === "error") expect(probe.detail).toContain("ECONNREFUSED");
  } finally {
    warns.mockRestore();
  }
});

test("a timed-out first attempt is final immediately (no 10s+10s stall)", async () => {
  let calls = 0;
  const attempt = async (id: string): Promise<ServeProbe> => {
    calls++;
    return { id, state: "error", detail: "timeout", timedOut: true };
  };
  const probe = await probeProvider("anthropic", attempt, 0);
  expect(calls).toBe(1);
  expect(probe.state).toBe("error");
});

test("a clean answer is never retried", async () => {
  let calls = 0;
  const attempt = async (id: string) => {
    calls++;
    return served(id);
  };
  await probeProvider("opencode", attempt, 0);
  expect(calls).toBe(1);
});

test("probeProviders caps concurrency and preserves order", async () => {
  const ids = Array.from({ length: 30 }, (_, i) => `p${i}`);
  let inFlight = 0;
  let peak = 0;
  const probe = async (id: string): Promise<ServeProbe> => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight--;
    return served(id);
  };
  const results = await probeProviders(ids, probe, PROBE_CONCURRENCY);
  expect(peak).toBeLessThanOrEqual(PROBE_CONCURRENCY);
  expect(peak).toBeGreaterThan(1); // still concurrent, not serial
  expect(results.map((p) => p.id)).toEqual(ids);
});

test("normalizeProbeDetail replaces every echo of the probe's own provider id", () => {
  // PRODUCT-1443: the host's error body names the provider ("credential
  // gateway GET qwen failed (500)"), which made every probe's detail unique
  // and defeated the sweep collapses. The id appears in the gateway path AND
  // in nested error text — all occurrences must normalize.
  expect(
    normalizeProbeDetail(
      "qwen",
      'credential gateway GET qwen failed (500): {"error":"qwen gateway error"}',
    ),
  ).toBe(
    'credential gateway GET <provider> failed (500): {"error":"<provider> gateway error"}',
  );
  // A body that never mentions the id passes through untouched.
  expect(normalizeProbeDetail("qwen", '{"error":"gateway error"}')).toBe(
    '{"error":"gateway error"}',
  );
});

test("probePath asks for a fresh serve only while an auth failure is active", () => {
  // PRODUCT-1515: the post-reconnect retry must not re-read the host's 15s
  // cached "not connected" that the failing turn itself populated.
  expect(probePath("anthropic", true)).toBe(
    "/sandbox/credential?provider=anthropic&fresh=1",
  );
  expect(probePath("anthropic", false)).toBe(
    "/sandbox/credential?provider=anthropic",
  );
});

test("describeProbeError surfaces the nested undici cause code", () => {
  // undici's socket failure: TypeError("fetch failed") with the code on cause.
  const socketErr = Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
  });
  expect(describeProbeError(socketErr)).toBe(
    "fetch failed (cause: ECONNRESET)",
  );

  // Happy-eyeballs connect failure: the cause is an AggregateError of
  // per-address errors, each carrying the code.
  const aggregate = Object.assign(new TypeError("fetch failed"), {
    cause: new AggregateError([
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), {
        code: "ECONNREFUSED",
      }),
    ]),
  });
  expect(describeProbeError(aggregate)).toBe(
    "fetch failed (cause: ECONNREFUSED)",
  );

  // errno-only causes stringify; causeless errors stay the bare message.
  const errnoErr = Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("socket hang up"), { errno: -54 }),
  });
  expect(describeProbeError(errnoErr)).toBe("fetch failed (cause: -54)");
  expect(describeProbeError(new Error("plain"))).toBe("plain");
  expect(describeProbeError("not an error")).toBe("not an error");
});
