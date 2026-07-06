import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import { isModelSelectorLocked } from "../src/lib/model-selector-lock.ts";

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

// The wire type lives on `Agent.access` (engine-client); the lock only reads
// that field, so the fixtures pass a minimal `{ access }` shape.
const agent = (access?: "manager" | "user") => ({ access });

describe("isModelSelectorLocked", () => {
  it("never locks when no agent scope is threaded", () => {
    // A caller who could never edit (multiplayer member) still isn't locked
    // when the selector isn't tied to a specific agent.
    strictEqual(isModelSelectorLocked(multiplayer("user"), null), false);
    strictEqual(isModelSelectorLocked(multiplayer("user"), undefined), false);
    strictEqual(isModelSelectorLocked(caps(), null), false);
  });

  it("never locks in single-player (self-host), even with an agent", () => {
    for (const access of ["manager", "user", undefined] as const) {
      strictEqual(isModelSelectorLocked(caps(), agent(access)), false);
      strictEqual(isModelSelectorLocked(null, agent(access)), false);
      strictEqual(isModelSelectorLocked(undefined, agent(access)), false);
    }
  });

  it("never locks the org owner (manages every agent)", () => {
    for (const access of ["manager", "user", undefined] as const) {
      strictEqual(
        isModelSelectorLocked(multiplayer("owner"), agent(access)),
        false,
      );
    }
  });

  it("locks a multiplayer non-owner unless their access is manager", () => {
    for (const role of ["admin", "user"] as const) {
      strictEqual(
        isModelSelectorLocked(multiplayer(role), agent("manager")),
        false,
      );
      strictEqual(
        isModelSelectorLocked(multiplayer(role), agent("user")),
        true,
      );
      // Missing access defaults to locked (no proof of manager authority).
      strictEqual(
        isModelSelectorLocked(multiplayer(role), agent(undefined)),
        true,
      );
    }
  });
});
