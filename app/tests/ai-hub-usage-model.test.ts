import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ProviderUsage } from "@houston-ai/engine-client";
import {
  formatCreditsAmount,
  formatMeteredSince,
  formatResetWhen,
  formatTokensAmount,
  matchUsageToProviders,
} from "../src/components/usage-view/usage-model.ts";
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
