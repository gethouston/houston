import { ok } from "node:assert";
import { describe, it } from "node:test";
import type { ProviderCatalog } from "@houston/protocol";
import { isModelAllowed } from "../src/lib/ceiling-match.ts";
import { isModelVisible } from "../src/lib/provider-overrides.ts";
import { catalogRunsAs, indexRunsAs } from "../src/lib/providers/runs-as.ts";

const { buildProviderCatalog } = (await import(
  new URL("../../packages/host/src/providers/pi-catalog.ts", import.meta.url)
    .href
)) as { buildProviderCatalog(): ProviderCatalog };

indexRunsAs(buildProviderCatalog());

describe("a ceiling naming a retired MiniMax id", () => {
  for (const retired of [
    "MiniMax-M3[1m]",
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
  ]) {
    it(`${retired} admits M3.1 Flash on minimax`, () => {
      ok(
        isModelAllowed(
          [retired],
          "minimax",
          "MiniMax-M3.1-Flash",
          catalogRunsAs,
        ),
      );
    });
    it(`${retired} stays out of the picker`, () => {
      ok(!isModelVisible("minimax", retired));
    });
  }
});
