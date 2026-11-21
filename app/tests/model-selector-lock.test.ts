import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgRole } from "@houston/engine-adapter";
import {
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

const teams = (role: OrgRole): Capabilities =>
  caps({ multiplayer: true, role, teams: true });

const preTeams = (role: OrgRole): Capabilities =>
  caps({ multiplayer: true, role });

const agent = (access?: "manager" | "user") => ({ access });

describe("modelSelectorDecision", () => {
  it("shows shared (never personal) when no agent scope is threaded", () => {
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

describe("resolvePersonalModelPin", () => {
  const fallback = { provider: "anthropic", model: "claude", effort: "high" };
  const blind = {
    offers: () => false,
    providerFor: () => null,
    runsAs: () => null,
    connected: [],
  };

  it("uses the user's stored choice when present", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        { provider: "openai", model: "gpt-6-astra", effort: "low" },
        ["gpt-6-astra"],
        fallback,
        null,
        blind,
      ),
      { provider: "openai", model: "gpt-6-astra", effort: "low" },
    );
  });

  it("drops a stored choice the ceiling no longer allows, keeping its effort (PRODUCT-1734)", () => {
    const resolver = {
      offers: (provider: string, model: string) =>
        provider === "anthropic" && model === "claude-opus-5",
      providerFor: () => "anthropic",
      runsAs: () => null,
      connected: ["anthropic"],
    };
    deepStrictEqual(
      resolvePersonalModelPin(
        { provider: "openai", model: "gpt-6-astra", effort: "low" },
        ["claude-opus-5"],
        fallback,
        null,
        resolver,
      ),
      { provider: "anthropic", model: "claude-opus-5", effort: "low" },
    );
  });

  it("keeps an in-ceiling fallback over an out-of-ceiling stored choice", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        { provider: "openai", model: "gpt-6-astra", effort: "low" },
        ["claude"],
        fallback,
        null,
        blind,
      ),
      { provider: "anthropic", model: "claude", effort: "low" },
    );
  });

  it("keeps a stored choice when there is no ceiling", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        { provider: "openai", model: "gpt-6-astra", effort: "low" },
        null,
        fallback,
        null,
        blind,
      ),
      { provider: "openai", model: "gpt-6-astra", effort: "low" },
    );
  });

  it("keeps the fallback when there is no ceiling", () => {
    deepStrictEqual(
      resolvePersonalModelPin(null, null, fallback, null, blind),
      fallback,
    );
    deepStrictEqual(
      resolvePersonalModelPin(undefined, undefined, fallback, null, blind),
      fallback,
    );
  });

  it("keeps the fallback when its model is inside the ceiling", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        null,
        ["claude", "gpt-6-astra"],
        fallback,
        null,
        blind,
      ),
      fallback,
    );
  });

  it("snaps to the ceiling model's owning provider", () => {
    deepStrictEqual(
      resolvePersonalModelPin(null, ["gpt-6-astra", "gemini"], fallback, null, {
        ...blind,
        providerFor: (model) => (model === "gpt-6-astra" ? "openai" : null),
      }),
      { provider: "openai", model: "gpt-6-astra", effort: "high" },
    );
  });

  it("snaps to the ceiling id the fallback provider can run, not the first entry (PRODUCT-1657)", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        null,
        ["anthropic/claude-opus-5", "claude-opus-5"],
        fallback,
        null,
        {
          offers: (provider, model) =>
            provider === "anthropic" && model === "claude-opus-5",
          providerFor: () => "openrouter",
          runsAs: () => null,
          connected: ["anthropic"],
        },
      ),
      { provider: "anthropic", model: "claude-opus-5", effort: "high" },
    );
  });

  it("keeps the fallback provider when the snapped model is unknown", () => {
    deepStrictEqual(
      resolvePersonalModelPin(null, ["unknown"], fallback, null, blind),
      { provider: "anthropic", model: "unknown", effort: "high" },
    );
  });

  it("keeps the fallback for an empty ceiling (no model to snap to)", () => {
    deepStrictEqual(
      resolvePersonalModelPin(null, [], fallback, null, blind),
      fallback,
    );
  });

  it("uses an in-ceiling mission pin while keeping personal effort", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        { provider: "openai", model: "gpt-6-astra", effort: "low" },
        ["claude", "gpt-6-astra"],
        fallback,
        { provider: "anthropic", model: "claude" },
        blind,
      ),
      { provider: "anthropic", model: "claude", effort: "low" },
    );
  });

  it("ignores an out-of-ceiling mission pin", () => {
    deepStrictEqual(
      resolvePersonalModelPin(
        { provider: "openai", model: "gpt-6-astra", effort: "low" },
        ["gpt-6-astra"],
        fallback,
        { provider: "anthropic", model: "claude" },
        blind,
      ),
      { provider: "openai", model: "gpt-6-astra", effort: "low" },
    );
  });
});
