import { describe, expect, it } from "vitest";
import { fetchAnthropicUsage } from "./anthropic";
import { fetchCodexUsage } from "./codex";
import { fetchCopilotUsage } from "./copilot";
import { fetchDeepSeekUsage, fetchOpenRouterUsage } from "./credits";
import { listProviderUsage } from "./index";
import { clampPercent, epochSecondsToIso } from "./types";

function jsonResponse(body: unknown, status = 200): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

const someToken = async () => "tok-123";

describe("fetchAnthropicUsage", () => {
  it("maps the five_hour / seven_day / opus blocks to windows", async () => {
    const row = await fetchAnthropicUsage(
      jsonResponse({
        five_hour: { utilization: 42, resets_at: "2026-07-13T10:00:00Z" },
        seven_day: { utilization: 80.5, resets_at: "2026-07-18T00:00:00Z" },
        seven_day_opus: null,
      }),
      someToken,
    );
    expect(row.status).toBe("ok");
    expect(row.windows).toEqual([
      {
        id: "session",
        usedPercent: 42,
        resetsAt: "2026-07-13T10:00:00Z",
        windowMinutes: 300,
      },
      {
        id: "week",
        usedPercent: 80.5,
        resetsAt: "2026-07-18T00:00:00Z",
        windowMinutes: 10_080,
      },
    ]);
    expect(row.fetchedAt).toBeTruthy();
  });

  it("reports unauthenticated with no token and on a 401", async () => {
    const noToken = await fetchAnthropicUsage(
      jsonResponse({}),
      async () => null,
    );
    expect(noToken.status).toBe("unauthenticated");
    const expired = await fetchAnthropicUsage(jsonResponse({}, 401), someToken);
    expect(expired.status).toBe("unauthenticated");
  });

  it("surfaces a non-2xx as an error row, never a throw", async () => {
    const row = await fetchAnthropicUsage(jsonResponse({}, 500), someToken);
    expect(row.status).toBe("error");
    expect(row.message).toContain("500");
  });
});

describe("fetchCodexUsage", () => {
  const store = {
    get: () => ({
      type: "oauth" as const,
      access: "at",
      refresh: "rt",
      expires: 0,
      accountId: "acc-1",
    }),
    getApiKey: async () => "at",
  };

  it("classifies windows by length and carries the plan", async () => {
    let sawAccountHeader = false;
    const fetchImpl: typeof fetch = async (_url, init) => {
      sawAccountHeader =
        (init?.headers as Record<string, string>)["ChatGPT-Account-Id"] ===
        "acc-1";
      return new Response(
        JSON.stringify({
          plan_type: "pro",
          rate_limit: {
            primary_window: {
              used_percent: 12,
              reset_at: 1_784_000_000,
              limit_window_seconds: 18_000,
            },
            secondary_window: {
              used_percent: 55,
              reset_at: 1_784_500_000,
              limit_window_seconds: 604_800,
            },
          },
        }),
        { status: 200 },
      );
    };
    const row = await fetchCodexUsage(fetchImpl, store);
    expect(sawAccountHeader).toBe(true);
    expect(row.status).toBe("ok");
    expect(row.plan).toBe("pro");
    expect(row.windows.map((w) => w.id)).toEqual(["session", "week"]);
    expect(row.windows[0].windowMinutes).toBe(300);
    expect(row.windows[0].resetsAt).toBe(
      new Date(1_784_000_000 * 1000).toISOString(),
    );
  });

  it("reports unauthenticated when no credential is stored", async () => {
    const row = await fetchCodexUsage(jsonResponse({}), {
      get: () => undefined,
      getApiKey: async () => undefined,
    });
    expect(row.status).toBe("unauthenticated");
  });
});

describe("fetchCopilotUsage", () => {
  const store = (enterpriseUrl?: string) => ({
    get: () => ({
      type: "oauth" as const,
      access: "copilot-session",
      refresh: "gh-token",
      expires: 0,
      ...(enterpriseUrl ? { enterpriseUrl } : {}),
    }),
  });

  it("inverts percent_remaining and shares the reset date", async () => {
    const row = await fetchCopilotUsage(
      jsonResponse({
        copilot_plan: "pro+",
        quota_reset_date: "2026-08-01",
        quota_snapshots: {
          premium_interactions: {
            entitlement: 1500,
            remaining: 300,
            percent_remaining: 20,
            unlimited: false,
          },
          chat: { unlimited: true },
        },
      }),
      store(),
    );
    expect(row.status).toBe("ok");
    expect(row.plan).toBe("pro+");
    expect(row.windows).toEqual([
      {
        id: "premium",
        usedPercent: 80,
        resetsAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
  });

  it("drops placeholder zero quotas and targets the enterprise host", async () => {
    let url = "";
    const fetchImpl: typeof fetch = async (input) => {
      url = String(input);
      return new Response(
        JSON.stringify({
          quota_snapshots: {
            premium_interactions: { entitlement: 0, remaining: 0 },
          },
        }),
        { status: 200 },
      );
    };
    const row = await fetchCopilotUsage(fetchImpl, store("acme.ghe.com"));
    expect(url).toBe("https://api.acme.ghe.com/copilot_internal/user");
    expect(row.status).toBe("ok");
    expect(row.windows).toEqual([]);
  });

  // Serve mode (Gate #2): the runtime's credential is access-only — the GitHub
  // token was scrubbed after login — so the probe must delegate to the host's
  // central endpoint instead of reporting "sign in again" forever.
  const scrubbedStore = {
    get: () => ({
      type: "oauth" as const,
      access: "copilot-session",
      refresh: "", // scrubbed by POST /auth/scrub-refresh
      expires: 0,
    }),
  };
  const serve = { controlPlaneUrl: "http://host.test", sandboxToken: "sbx" };

  it("delegates a scrubbed credential to the host's central probe", async () => {
    let url = "";
    let auth = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      url = String(input);
      auth = (init?.headers as Record<string, string>).Authorization;
      return new Response(
        JSON.stringify({
          copilot_plan: "pro",
          quota_reset_date: "2026-08-01",
          quota_snapshots: {
            premium_interactions: { percent_remaining: 40 },
          },
        }),
        { status: 200 },
      );
    };
    const row = await fetchCopilotUsage(fetchImpl, scrubbedStore, serve);
    expect(url).toBe(
      "http://host.test/sandbox/provider-usage?provider=github-copilot",
    );
    expect(auth).toBe("Bearer sbx"); // the sandbox token, never a GitHub one
    expect(row.status).toBe("ok");
    expect(row.plan).toBe("pro");
    expect(row.windows).toEqual([
      { id: "premium", usedPercent: 60, resetsAt: "2026-08-01T00:00:00.000Z" },
    ]);
  });

  it("maps the host's marked 404 and 401 to unauthenticated, 502 to error", async () => {
    const respond = (status: number) =>
      fetchCopilotUsage(
        async () => new Response(JSON.stringify({ error: "x" }), { status }),
        scrubbedStore,
        serve,
      );
    expect((await respond(404)).status).toBe("unauthenticated");
    expect((await respond(401)).status).toBe("unauthenticated");
    const failed = await respond(502);
    expect(failed.status).toBe("error");
    expect(failed.message).toContain("502");
  });

  it("stays unauthenticated when scrubbed with no serve source (no host to ask)", async () => {
    const row = await fetchCopilotUsage(jsonResponse({}), scrubbedStore, null);
    expect(row.status).toBe("unauthenticated");
  });
});

describe("credit balances", () => {
  const keyStore = { has: () => true, getApiKey: async () => "sk-1" };

  it("openrouter: remaining = credits - usage", async () => {
    const row = await fetchOpenRouterUsage(
      jsonResponse({ data: { total_credits: 25, total_usage: 5.5 } }),
      keyStore,
    );
    expect(row.status).toBe("ok");
    expect(row.credits).toEqual({
      remaining: 19.5,
      granted: 25,
      unit: "USD",
    });
  });

  it("openrouter: an unreadable balance is an error, not a $0 balance", async () => {
    const row = await fetchOpenRouterUsage(
      jsonResponse({ data: { credits: 25 } }),
      keyStore,
    );
    expect(row.status).toBe("error");
    expect(row.credits).toBeUndefined();
  });

  it("deepseek: parses the string USD balance", async () => {
    const row = await fetchDeepSeekUsage(
      jsonResponse({
        is_available: true,
        balance_infos: [
          { currency: "CNY", total_balance: "3.00" },
          { currency: "USD", total_balance: "12.34" },
        ],
      }),
      keyStore,
    );
    expect(row.status).toBe("ok");
    expect(row.credits).toEqual({ remaining: 12.34, unit: "USD" });
  });

  it("reports unauthenticated when no key is stored", async () => {
    const empty = { has: () => false, getApiKey: async () => undefined };
    const or = await fetchOpenRouterUsage(jsonResponse({}), empty);
    const ds = await fetchDeepSeekUsage(jsonResponse({}), empty);
    expect(or.status).toBe("unauthenticated");
    expect(ds.status).toBe("unauthenticated");
  });
});

describe("listProviderUsage", () => {
  it("fans out per connected provider; one failure never sinks the batch", async () => {
    const rows = await listProviderUsage(
      ["anthropic", "google", "deepseek"],
      {
        anthropic: async () => ({
          provider: "anthropic",
          status: "ok" as const,
          windows: [],
        }),
        deepseek: async () => {
          throw new Error("network down");
        },
      },
      () => null, // nothing metered locally
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].status).toBe("ok");
    expect(rows[1]).toEqual({
      provider: "google",
      status: "unsupported",
      windows: [],
    });
    expect(rows[2].status).toBe("error");
    expect(rows[2].message).toBe("network down");
  });

  it("serves the local token ledger for providers with no fetcher", async () => {
    const spend = {
      inputTokens: 12_000,
      outputTokens: 3_400,
      turns: 7,
      since: "2026-07-01T00:00:00.000Z",
    };
    const rows = await listProviderUsage(
      ["google", "amazon-bedrock"],
      {},
      (provider) => (provider === "google" ? spend : null),
    );
    expect(rows[0]).toMatchObject({
      provider: "google",
      status: "ok",
      windows: [],
      tokens: spend,
    });
    expect(rows[0].fetchedAt).toEqual(expect.any(String));
    // Never metered → still the honest `unsupported` row.
    expect(rows[1]).toEqual({
      provider: "amazon-bedrock",
      status: "unsupported",
      windows: [],
    });
  });
});

describe("normalization helpers", () => {
  it("clampPercent bounds onto 0-100 and drops junk", () => {
    expect(clampPercent(42.5)).toBe(42.5);
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent("nope")).toBe(0);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it("epochSecondsToIso converts valid epochs only", () => {
    expect(epochSecondsToIso(1_784_000_000)).toBe(
      new Date(1_784_000_000 * 1000).toISOString(),
    );
    expect(epochSecondsToIso(0)).toBeNull();
    expect(epochSecondsToIso("soon")).toBeNull();
  });
});
