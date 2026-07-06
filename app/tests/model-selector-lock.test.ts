import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import { shouldShowModelSelector } from "../src/lib/model-selector-lock.ts";

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

const multiplayer = (role: OrgRole): Capabilities =>
  caps({ multiplayer: true, role });

// The wire type lives on `Agent.access` (engine-client); the helper only reads
// that field, so the fixtures pass a minimal `{ access }` shape.
const agent = (access?: "manager" | "user") => ({ access });

describe("shouldShowModelSelector", () => {
  it("always shows when no agent scope is threaded", () => {
    // A caller who could never edit (multiplayer member) still sees the picker
    // when it isn't tied to a specific agent (e.g. the routine editor).
    strictEqual(shouldShowModelSelector(multiplayer("user"), null), true);
    strictEqual(shouldShowModelSelector(multiplayer("user"), undefined), true);
    strictEqual(shouldShowModelSelector(caps(), null), true);
  });

  it("always shows in single-player (self-host), even with an agent", () => {
    for (const access of ["manager", "user", undefined] as const) {
      strictEqual(shouldShowModelSelector(caps(), agent(access)), true);
      strictEqual(shouldShowModelSelector(null, agent(access)), true);
      strictEqual(shouldShowModelSelector(undefined, agent(access)), true);
    }
  });

  it("always shows for the org owner (manages every agent)", () => {
    for (const access of ["manager", "user", undefined] as const) {
      strictEqual(
        shouldShowModelSelector(multiplayer("owner"), agent(access)),
        true,
      );
    }
  });

  it("hides for a multiplayer non-owner unless their access is manager", () => {
    for (const role of ["admin", "user"] as const) {
      strictEqual(
        shouldShowModelSelector(multiplayer(role), agent("manager")),
        true,
      );
      strictEqual(
        shouldShowModelSelector(multiplayer(role), agent("user")),
        false,
      );
      // Missing access defaults to hidden (no proof of manager authority).
      strictEqual(
        shouldShowModelSelector(multiplayer(role), agent(undefined)),
        false,
      );
    }
  });
});
