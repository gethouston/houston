import { deepStrictEqual, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { missionRowInput } from "../src/lib/mission-row.ts";
import { hydrateProviderCatalog } from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

/**
 * A mission's board row is the pin every later send reads back (the warming
 * queue's `preferRowPin`, the picker, `resolveActivityOverride`). A row written
 * in the picker's display dialect resolves to no provider at all downstream,
 * and a row written with `model: ""` reads as a mission pinned to nothing.
 */

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
    // The row write lives in its own module since the waking-retry ladder
    // (PRODUCT-1736); the payload is built once and re-posted per rung.
    const landing = source("mission-row-landing.ts");
    strictEqual(
      /const input = missionRowInput\(mission, opts\)/.test(landing),
      true,
    );
    strictEqual(
      /createWithIdAttempt\(agent\.folderPath, input\)/.test(landing),
      true,
    );
  });

  it("the warming queue parks the shared row payload", () => {
    strictEqual(
      /row: missionRowInput\(/.test(source("create-mission-warming.ts")),
      true,
    );
  });
});
