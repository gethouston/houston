import { strictEqual } from "node:assert";
import { test } from "node:test";
import { AUTOCOMPACT_CEILING_TOKENS } from "@houston/protocol/model-windows";
import {
  contextFillPercent,
  effectiveContextWindow,
} from "../src/lib/context-usage.ts";

const usage = (context_tokens: number) => ({
  context_tokens,
  output_tokens: 0,
  cached_tokens: 0,
});

test("a 1M chat reads 93% on the gauge when it reaches the 200k compaction point", () => {
  const window = effectiveContextWindow(
    { default: 1_000_000, max: 1_000_000 },
    AUTOCOMPACT_CEILING_TOKENS,
  );
  strictEqual(window, 215_054);
  strictEqual(
    contextFillPercent(usage(AUTOCOMPACT_CEILING_TOKENS), window),
    93,
  );
});

test("a window smaller than the ceiling's room is divided by as is", () => {
  const window = effectiveContextWindow(
    { default: 128_000, max: 128_000 },
    100_000,
  );
  strictEqual(window, 128_000);
  // 93% of 128k is where that model compacts.
  strictEqual(contextFillPercent(usage(119_040), window), 93);
});

test("a peak from before the ceiling never reads over 100%", () => {
  const window = effectiveContextWindow(
    { default: 1_000_000, max: 1_000_000 },
    900_000,
  );
  strictEqual(window, 900_000);
  strictEqual(contextFillPercent(usage(900_000), window), 100);
});
