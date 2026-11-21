import { deepStrictEqual, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { missionRowInput } from "../src/lib/mission-row.ts";
import { hydrateProviderCatalog } from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

const MISSION = {
  conversationId: "m1",
  title: "Tidy the deck",
  description: "please tidy the deck",
};

before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

describe("missionRowInput", () => {
  it("stamps the provider in pi's canonical dialect", () => {
    deepStrictEqual(
      missionRowInput(MISSION, {
        providerOverride: "openai",
        modelOverride: "gpt-5.1-codex",
      }),
      {
        id: "m1",
        title: "Tidy the deck",
        description: "please tidy the deck",
        agent: undefined,
        provider: "openai-codex",
        model: "gpt-5.1-codex",
      },
    );
  });

  it("omits a model the catalog could not resolve rather than pinning an empty one", () => {
    const row = missionRowInput(MISSION, {
      providerOverride: "anthropic",
      modelOverride: "",
    });
    strictEqual("model" in row, false);
    strictEqual(row.provider, "anthropic");
  });

  it("pins nothing when the send pinned nothing", () => {
    const row = missionRowInput(MISSION, { agentMode: "build" });
    strictEqual("provider" in row, false);
    strictEqual("model" in row, false);
    strictEqual(row.agent, "build");
  });
});

describe("both mission creation paths route their row through it", () => {
  const source = (file: string) =>
    readFileSync(new URL(`../src/lib/${file}`, import.meta.url), "utf8");

  it("the optimistic create posts the shared row payload", () => {
    const landing = source("mission-row-landing.ts");
    strictEqual(
      /const input = missionRowInput\(mission, opts\)/.test(landing),
      true,
    );
    strictEqual(
      /createWithIdAttempt\(\s*agent\.folderPath,\s*input,?\s*\)/.test(landing),
      true,
    );
  });

  it("the warming queue parks the shared row payload", () => {
    strictEqual(
      /row: missionRowInput\(/.test(source("create-mission-warming.ts")),
      true,
    );
  });

  it("keeps the composer's mode on the new card, and only when one is set", () => {
    strictEqual(
      missionRowInput(MISSION, { modeOverride: "auto" }).mode,
      "auto",
    );
    strictEqual("mode" in missionRowInput(MISSION, {}), false);
  });
});
