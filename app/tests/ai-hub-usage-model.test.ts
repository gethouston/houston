import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ProviderUsage } from "@houston-ai/engine-client";
import {
  formatCreditsAmount,
  formatMeteredSince,
  formatResetWhen,
  formatTokensAmount,
  hasConfirmedAccount,
  matchUsageToProviders,
  type UsageFetchState,
  usageSlot,
} from "../src/components/ai-hub/provider-usage-model.ts";
import type { ProviderConnectionState } from "../src/lib/provider-connection.ts";
import type { ProviderInfo } from "../src/lib/providers.ts";

function card(id: string, gatewayIds?: readonly string[]): ProviderInfo {
  return {
    id,
    name: id,
    subtitle: "",
    installUrl: "",
    cost: "",
    models: [],
    defaultModel: "",
    ...(gatewayIds ? { gatewayIds } : {}),
  };
}

function row(
  provider: string,
  status: ProviderUsage["status"] = "ok",
): ProviderUsage {
  return { provider, status, windows: [] };
}

const ALL_FETCH_STATES: UsageFetchState[] = ["loading", "error", "ready"];

describe("hasConfirmedAccount", () => {
  const state =
    (map: Record<string, ProviderConnectionState>) => (p: ProviderInfo) =>
      map[p.id] ?? "disconnected";

  it("is false when every account on the strip is still unconfirmed", () => {
    // The state a waking pod / unreachable engine produces: every probe comes
    // back `unknown`, so the strip is full and there is nothing to read. The
    // engine call THROWS in exactly this state, so asking would be a failure
    // on a loop.
    strictEqual(
      hasConfirmedAccount(
        [card("anthropic"), card("openai")],
        state({ anthropic: "checking", openai: "checking" }),
      ),
      false,
    );
  });

  it("is true as soon as ONE account is confirmed", () => {
    strictEqual(
      hasConfirmedAccount(
        [card("anthropic"), card("openai")],
        state({ anthropic: "checking", openai: "connected" }),
      ),
      true,
    );
  });

  it("is false for an empty strip", () => {
    strictEqual(
      hasConfirmedAccount([], () => "connected"),
      false,
    );
  });
});

describe("usageSlot", () => {
  it("makes NO metering claim about an account it could not confirm", () => {
    // The bug this guards: a `checking` row falling through to "No usage yet.
    // Houston will start measuring with your next message." — a promise about
    // an account Houston cannot even read. Nothing renders instead, in every
    // fetch state, whatever the engine happened to report.
    for (const fetchState of ALL_FETCH_STATES) {
      deepStrictEqual(usageSlot("checking", fetchState, null), {
        kind: "hidden",
      });
      deepStrictEqual(usageSlot("checking", fetchState, row("anthropic")), {
        kind: "hidden",
      });
      deepStrictEqual(usageSlot("disconnected", fetchState, null), {
        kind: "hidden",
      });
    }
  });

  it("holds the loading frame while the strip's one fetch is in flight", () => {
    deepStrictEqual(usageSlot("connected", "loading", null), {
      kind: "loading",
    });
  });

  it("says the fetch failed rather than calling the account unmetered", () => {
    deepStrictEqual(usageSlot("connected", "error", null), {
      kind: "note",
      note: "error",
    });
  });

  it("maps each non-ok row (and a missing row) to its honest note", () => {
    deepStrictEqual(usageSlot("connected", "ready", null), {
      kind: "note",
      note: "notMeteredYet",
    });
    deepStrictEqual(
      usageSlot("connected", "ready", row("anthropic", "unsupported")),
      { kind: "note", note: "notMeteredYet" },
    );
    deepStrictEqual(
      usageSlot("connected", "ready", row("anthropic", "unauthenticated")),
      { kind: "note", note: "reconnect" },
    );
    deepStrictEqual(
      usageSlot("connected", "ready", row("anthropic", "error")),
      {
        kind: "note",
        note: "error",
      },
    );
    // `ok` with nothing in it is its own honest note, not an empty meter.
    deepStrictEqual(usageSlot("connected", "ready", row("anthropic")), {
      kind: "note",
      note: "noData",
    });
  });

  it("renders meters once there is anything to show", () => {
    const withWindow: ProviderUsage = {
      provider: "anthropic",
      status: "ok",
      windows: [{ id: "session", usedPercent: 42, resetsAt: null }],
    };
    deepStrictEqual(usageSlot("connected", "ready", withWindow), {
      kind: "meters",
      row: withWindow,
    });
  });
});

describe("matchUsageToProviders", () => {
  it("pairs display cards with engine rows across the id rename", () => {
    // The Codex card is the DISPLAY id `openai`; the engine row speaks
    // `openai-codex`. The pairing must bridge the rename.
    const accounts = matchUsageToProviders(
      [card("openai"), card("anthropic")],
      [row("anthropic"), row("openai-codex")],
    );
    strictEqual(accounts[0].row?.provider, "openai-codex");
    strictEqual(accounts[1].row?.provider, "anthropic");
  });

  it("keeps the most informative row for a merged multi-gateway card", () => {
    const accounts = matchUsageToProviders(
      [card("opencode-account", ["opencode", "opencode-go"])],
      [row("opencode", "unsupported"), row("opencode-go", "error")],
    );
    strictEqual(accounts[0].row?.status, "error");
  });

  it("keeps a connected card with no engine row (row: null), never drops it", () => {
    const accounts = matchUsageToProviders([card("google")], []);
    deepStrictEqual(accounts, [{ provider: card("google"), row: null }]);
  });
});

describe("formatResetWhen", () => {
  const now = Date.parse("2026-07-13T12:00:00Z");

  it("localizes the reset instant at minute/hour/day granularity", () => {
    strictEqual(
      formatResetWhen("2026-07-13T12:30:00Z", "en", now),
      "in 30 minutes",
    );
    strictEqual(
      formatResetWhen("2026-07-13T15:00:00Z", "en", now),
      "in 3 hours",
    );
    strictEqual(
      formatResetWhen("2026-07-18T12:00:00Z", "en", now),
      "in 5 days",
    );
  });

  it("answers null for absent, past, or malformed instants", () => {
    strictEqual(formatResetWhen(null, "en", now), null);
    strictEqual(formatResetWhen("2026-07-13T11:00:00Z", "en", now), null);
    strictEqual(formatResetWhen("garbage", "en", now), null);
  });
});

describe("formatTokensAmount", () => {
  it("compacts token counts at any magnitude", () => {
    strictEqual(formatTokensAmount(950, "en"), "950");
    strictEqual(formatTokensAmount(34_500, "en"), "34.5K");
    strictEqual(formatTokensAmount(1_230_000, "en"), "1.2M");
  });

  it("clamps junk negatives to zero", () => {
    strictEqual(formatTokensAmount(-3, "en"), "0");
  });
});

describe("formatMeteredSince", () => {
  it("renders a short localized date and null for junk", () => {
    // Midday UTC so the short date is stable across test-machine timezones
    // (a midnight instant renders as the previous day west of UTC).
    strictEqual(formatMeteredSince("2026-07-01T12:00:00.000Z", "en"), "Jul 1");
    strictEqual(formatMeteredSince("", "en"), null);
    strictEqual(formatMeteredSince("garbage", "en"), null);
  });
});

describe("formatCreditsAmount", () => {
  it("formats USD as currency and credit units as a plain number", () => {
    strictEqual(
      formatCreditsAmount({ remaining: 12.34, unit: "USD" }, "en"),
      "$12.34",
    );
    strictEqual(
      formatCreditsAmount(
        { remaining: 19.5, granted: 25, unit: "credits" },
        "en",
      ),
      "19.5",
    );
  });
});
