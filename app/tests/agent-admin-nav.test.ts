import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston-ai/engine-client";
import {
  adminScreens,
  contextScreens,
  targetToScreen,
} from "../src/components/tabs/agent-admin/agent-admin-nav.ts";

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: [],
  openaiCompatible: false,
  integrations: [],
  ...over,
});

describe("contextScreens — the Context tab's rows", () => {
  it("always carries instructions and knowledge, in order", () => {
    deepStrictEqual(contextScreens(), ["instructions", "knowledge"]);
  });
});

describe("adminScreens — the Admin tab's rows", () => {
  it("single-player: no rows at all (the Admin tab is hidden there)", () => {
    deepStrictEqual(adminScreens(caps()), []);
    // A null capabilities host (legacy / pre-Teams) behaves the same.
    deepStrictEqual(adminScreens(null), []);
  });

  it("Teams: people, apps, and models", () => {
    deepStrictEqual(adminScreens(caps({ multiplayer: true, teams: true })), [
      "people",
      "integrations",
      "model",
    ]);
  });

  it("legacy multiplayer without Teams keeps the People row only", () => {
    deepStrictEqual(adminScreens(caps({ multiplayer: true, teams: false })), [
      "people",
    ]);
  });

  it("no Connect row anywhere — even on an apiKeys gateway (HOU-806)", () => {
    for (const c of [
      caps({ apiKeys: true }),
      caps({ multiplayer: true, teams: true, apiKeys: true }),
    ]) {
      strictEqual(adminScreens(c).includes("connect" as never), false);
    }
  });
});

describe("targetToScreen — deep-link mapping", () => {
  it("maps learnings to the knowledge screen, instructions passes through", () => {
    strictEqual(targetToScreen("instructions"), "instructions");
    strictEqual(targetToScreen("learnings"), "knowledge");
  });
});
