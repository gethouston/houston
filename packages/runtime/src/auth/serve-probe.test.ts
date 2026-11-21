import { expect, test, vi } from "vitest";
import {
  anthropicServedVerdict,
  describeProbeError,
  normalizeProbeDetail,
  PROBE_CONCURRENCY,
  probePath,
  probeProvider,
  probeProviders,
  type ServeProbe,
} from "./serve-probe";

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
  expect(peak).toBeGreaterThan(1);
  expect(results.map((p) => p.id)).toEqual(ids);
});

test("normalizeProbeDetail replaces every echo of the probe's own provider id", () => {
  expect(
    normalizeProbeDetail(
      "qwen",
      'credential gateway GET qwen failed (500): {"error":"qwen gateway error"}',
    ),
  ).toBe(
    'credential gateway GET <provider> failed (500): {"error":"<provider> gateway error"}',
  );
  expect(normalizeProbeDetail("qwen", '{"error":"gateway error"}')).toBe(
    '{"error":"gateway error"}',
  );
});

test("probePath asks for a fresh serve only while an auth failure is active", () => {
  expect(probePath("anthropic", true)).toBe(
    "/sandbox/credential?provider=anthropic&fresh=1",
  );
  expect(probePath("anthropic", false)).toBe(
    "/sandbox/credential?provider=anthropic",
  );
});

test("describeProbeError surfaces the nested undici cause code", () => {
  const socketErr = Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
  });
  expect(describeProbeError(socketErr)).toBe(
    "fetch failed (cause: ECONNRESET)",
  );

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

  const errnoErr = Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("socket hang up"), { errno: -54 }),
  });
  expect(describeProbeError(errnoErr)).toBe("fetch failed (cause: -54)");
  expect(describeProbeError(new Error("plain"))).toBe("plain");
  expect(describeProbeError("not an error")).toBe("not an error");
});

test("anthropicServedVerdict: the not-served-here marker says this host never serves anthropic", () => {
  expect(
    anthropicServedVerdict({
      id: "anthropic",
      state: "not-connected",
      notServedHere: true,
    }),
  ).toBe(false);
});

test("anthropicServedVerdict: a served or plainly not-connected anthropic probe says it does", () => {
  expect(
    anthropicServedVerdict({ id: "anthropic", state: "not-connected" }),
  ).toBe(true);
  expect(
    anthropicServedVerdict({
      id: "anthropic",
      state: "served",
      cred: {
        provider: "anthropic",
        kind: "oauth",
        accessToken: "AT",
        refreshToken: "",
        expiresAt: 1,
      } as never,
    }),
  ).toBe(true);
});

test("anthropicServedVerdict: other providers and unanswered probes teach nothing", () => {
  expect(
    anthropicServedVerdict({
      id: "openai-codex",
      state: "not-connected",
      notServedHere: true,
    }),
  ).toBeUndefined();
  expect(
    anthropicServedVerdict({ id: "anthropic", state: "error", detail: "x" }),
  ).toBeUndefined();
});

test("a typed account block is final immediately: the provider's verdict, not a blip (H-005)", async () => {
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    let calls = 0;
    const attempt = async (id: string): Promise<ServeProbe> => {
      calls++;
      return {
        id,
        state: "error",
        detail: "502: provider account blocked",
        blocked: true,
      };
    };
    const probe = await probeProvider("github-copilot", attempt, 0);
    expect(probe.state).toBe("error");
    expect(probe.state === "error" && probe.blocked).toBe(true);
    expect(calls).toBe(1);
    expect(warns).not.toHaveBeenCalled();
  } finally {
    warns.mockRestore();
  }
});
