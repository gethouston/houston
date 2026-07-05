import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  formatPrice,
  formatReleaseDate,
  formatTokens,
  labName,
  sortOffers,
} from "../src/components/ai-hub/format.ts";
import type { CatalogOffer } from "../src/lib/ai-hub/catalog-types.ts";

describe("formatTokens", () => {
  it("renders thousands as K, rounded to the nearest K", () => {
    strictEqual(formatTokens(200_000), "200K");
    strictEqual(formatTokens(262_144), "262K");
    strictEqual(formatTokens(512_000), "512K");
  });

  it("renders a million and above as M, dropping a trailing .0", () => {
    strictEqual(formatTokens(1_000_000), "1M");
    strictEqual(formatTokens(1_048_576), "1M");
    strictEqual(formatTokens(2_500_000), "2.5M");
  });

  it("passes small counts through and rejects invalid input", () => {
    strictEqual(formatTokens(512), "512");
    strictEqual(formatTokens(-1), "");
    strictEqual(formatTokens(Number.NaN), "");
  });
});

describe("formatPrice", () => {
  it("keeps a cents pair for fractional dollars", () => {
    strictEqual(formatPrice(2.5), "$2.50");
    strictEqual(formatPrice(1.2), "$1.20");
  });

  it("drops the cents for whole dollars", () => {
    strictEqual(formatPrice(3), "$3");
    strictEqual(formatPrice(15), "$15");
  });

  it("keeps precision for sub-dollar prices", () => {
    strictEqual(formatPrice(0.25), "$0.25");
    strictEqual(formatPrice(0.075), "$0.075");
    strictEqual(formatPrice(0.6), "$0.60");
    strictEqual(formatPrice(0), "$0");
  });

  it("keeps sub-cent prices legible (the old formatCost collapsed these to $0.00)", () => {
    strictEqual(formatPrice(0.002), "$0.002");
    strictEqual(formatPrice(0.014), "$0.014");
    // A whole-dollar price the old formatCost padded to "$3.00".
    strictEqual(formatPrice(3), "$3");
  });

  it("returns empty for a missing price", () => {
    strictEqual(formatPrice(undefined), "");
    strictEqual(formatPrice(Number.NaN), "");
  });
});

describe("formatReleaseDate", () => {
  it("renders a month and year, unshifted by timezone", () => {
    strictEqual(formatReleaseDate("2025-11-24", "en-US"), "Nov 2025");
    strictEqual(formatReleaseDate("2025-01-01", "en-US"), "Jan 2025");
  });

  it("returns empty for missing or unparseable input", () => {
    strictEqual(formatReleaseDate(undefined, "en-US"), "");
    strictEqual(formatReleaseDate("not-a-date", "en-US"), "");
  });
});

describe("labName", () => {
  it("maps lab ids to brand proper nouns", () => {
    strictEqual(labName("anthropic"), "Anthropic");
    strictEqual(labName("openai"), "OpenAI");
    strictEqual(labName("xai"), "xAI");
    strictEqual(labName("zai"), "Z.ai");
    strictEqual(labName("other"), "Other");
  });
});

describe("sortOffers", () => {
  const offer = (
    providerId: string,
    extra: Partial<CatalogOffer> = {},
  ): CatalogOffer => ({
    providerId,
    modelId: `${providerId}-model`,
    subscription: false,
    ...extra,
  });

  it("puts connected offers first", () => {
    const offers = [
      offer("openrouter", { costInput: 1 }),
      offer("amazon-bedrock", { costInput: 5 }),
    ];
    const sorted = sortOffers(offers, (o) => o.providerId === "amazon-bedrock");
    deepStrictEqual(
      sorted.map((o) => o.providerId),
      ["amazon-bedrock", "openrouter"],
    );
  });

  it("orders subscription before priced offers, then by cheapest input", () => {
    const offers = [
      offer("openrouter", { costInput: 3 }),
      offer("deepseek", { costInput: 0.5 }),
      offer("anthropic", { subscription: true }),
    ];
    const sorted = sortOffers(offers, () => false);
    deepStrictEqual(
      sorted.map((o) => o.providerId),
      ["anthropic", "deepseek", "openrouter"],
    );
  });

  it("does not mutate the input array", () => {
    const offers = [offer("b", { costInput: 2 }), offer("a", { costInput: 1 })];
    const before = offers.map((o) => o.providerId);
    sortOffers(offers, () => false);
    deepStrictEqual(
      offers.map((o) => o.providerId),
      before,
    );
  });
});
