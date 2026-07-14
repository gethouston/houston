import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import { encodeModelPickerId } from "../src/lib/chat-model-picker-ids.ts";
import {
  hiddenModelCount,
  isModelAllowed,
  modelSelectorDecision,
  resolvePersonalModelPin,
} from "../src/lib/model-selector-lock.ts";

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

/** A multiplayer host with the Teams v2 surface (per-user model choice). */
const teams = (role: OrgRole): Capabilities =>
  caps({ multiplayer: true, role, teams: true });

/** A multiplayer host predating Teams (no per-user model-choice route). */
const preTeams = (role: OrgRole): Capabilities =>
  caps({ multiplayer: true, role });

// The wire type lives on `Agent.access` (engine-client); the helpers only read
// that field, so the fixtures pass a minimal `{ access }` shape.
const agent = (access?: "manager" | "user") => ({ access });

describe("modelSelectorDecision", () => {
  it("shows shared (never personal) when no agent scope is threaded", () => {
    // A free-standing picker (routine editor with no agent, create wizard) is
    // always shown and never wired to a per-user choice, even for a member.
    for (const c of [
      teams("user"),
      preTeams("user"),
      caps(),
      null,
      undefined,
    ]) {
      deepStrictEqual(modelSelectorDecision(c, null), {
        show: true,
        personal: false,
      });
      deepStrictEqual(modelSelectorDecision(c, undefined), {
        show: true,
        personal: false,
      });
    }
  });

  it("shows shared in single-player / self-host, whatever the access", () => {
    for (const access of ["manager", "user", undefined] as const) {
      for (const c of [caps(), null, undefined]) {
        deepStrictEqual(modelSelectorDecision(c, agent(access)), {
          show: true,
          personal: false,
        });
      }
    }
  });

  it("shows PERSONAL for EVERYONE on a Teams host (members included)", () => {
    for (const role of ["owner", "admin", "user"] as const) {
      for (const access of ["manager", "user", undefined] as const) {
        deepStrictEqual(modelSelectorDecision(teams(role), agent(access)), {
          show: true,
          personal: true,
        });
      }
    }
  });

  it("falls back to the E7 manager gate on a pre-Teams multiplayer host", () => {
    // Owner + any manager see it (shared); a plain member is hidden.
    deepStrictEqual(modelSelectorDecision(preTeams("owner"), agent("user")), {
      show: true,
      personal: false,
    });
    for (const role of ["admin", "user"] as const) {
      deepStrictEqual(modelSelectorDecision(preTeams(role), agent("manager")), {
        show: true,
        personal: false,
      });
      deepStrictEqual(modelSelectorDecision(preTeams(role), agent("user")), {
        show: false,
        personal: false,
      });
      deepStrictEqual(modelSelectorDecision(preTeams(role), agent(undefined)), {
        show: false,
        personal: false,
      });
    }
  });
});

describe("isModelAllowed", () => {
  it("treats null / undefined ceiling as no ceiling (all models allowed)", () => {
    strictEqual(isModelAllowed(null, "gpt-5.5"), true);
    strictEqual(isModelAllowed(undefined, "gpt-5.5"), true);
  });

  it("gates on membership when a ceiling is set", () => {
    strictEqual(isModelAllowed(["gpt-5.5", "claude"], "gpt-5.5"), true);
    strictEqual(isModelAllowed(["gpt-5.5"], "claude"), false);
    strictEqual(isModelAllowed([], "gpt-5.5"), false);
  });
});

describe("resolvePersonalModelPin", () => {
  const fallback = { provider: "anthropic", model: "claude", effort: "high" };

  it("uses the user's stored choice when present", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        { provider: "openai", model: "gpt-5.5", effort: "low" },
        ["gpt-5.5"],
        fallback,
      ),
      { provider: "openai", model: "gpt-5.5", effort: "low" },
    );
  });

  it("keeps the fallback when there is no ceiling", () => {
    deepStrictEqual(resolvePersonalModelPin(null, null, fallback), fallback);
    deepStrictEqual(
      resolvePersonalModelPin(undefined, undefined, fallback),
      fallback,
    );
  });

  it("keeps the fallback when its model is inside the ceiling", () => {
    deepStrictEqual(
      resolvePersonalModelPin(null, ["claude", "gpt-5.5"], fallback),
      fallback,
    );
  });

  it("snaps to the ceiling's first model when the fallback is outside it", () => {
    deepStrictEqual(
      resolvePersonalModelPin(null, ["gpt-5.5", "gemini"], fallback),
      { provider: "anthropic", model: "gpt-5.5", effort: "high" },
    );
  });

  it("keeps the fallback for an empty ceiling (no model to snap to)", () => {
    deepStrictEqual(resolvePersonalModelPin(null, [], fallback), fallback);
  });
});

describe("hiddenModelCount", () => {
  // Picker rows carry an opaque `provider::model` id; the fixture builds them
  // from (provider, model) pairs the same way the container does.
  const rows = (...pairs: [string, string][]) =>
    pairs.map(([provider, model]) => ({
      id: encodeModelPickerId(provider, model),
    }));

  const universe = rows(
    ["anthropic", "claude"],
    ["openai", "gpt-5.5"],
    ["google", "gemini"],
  );

  it("hides nothing when there is no ceiling", () => {
    strictEqual(hiddenModelCount(universe, null), 0);
  });

  it("hides nothing when the ceiling allows every model", () => {
    strictEqual(hiddenModelCount(universe, ["claude", "gpt-5.5", "gemini"]), 0);
  });

  it("counts exactly the models the ceiling turns off", () => {
    strictEqual(hiddenModelCount(universe, ["claude"]), 2);
    strictEqual(hiddenModelCount(universe, ["claude", "gpt-5.5"]), 1);
  });

  it("counts a model offered by two providers once", () => {
    // Same bare model id from two providers is one hidden model, not two.
    const dupes = rows(
      ["openrouter", "gpt-5.5"],
      ["openai", "gpt-5.5"],
      ["anthropic", "claude"],
    );
    strictEqual(hiddenModelCount(dupes, ["claude"]), 1);
  });

  it("hides nothing for an empty universe", () => {
    strictEqual(hiddenModelCount([], ["claude"]), 0);
    strictEqual(hiddenModelCount([], null), 0);
  });
});
