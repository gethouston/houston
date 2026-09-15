import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston-ai/engine-client";
import type { AssistantDiscovery } from "../src/lib/assistant-discovery-state.ts";
import { surfaceGatesFor } from "../src/lib/surface-gates-model.ts";

const owner: Capabilities = {
  multiplayer: true,
  role: "owner",
} as unknown as Capabilities;

const discovering: AssistantDiscovery = {
  handle: null,
  isLoading: true,
  unavailable: false,
};
const settledAbsent: AssistantDiscovery = {
  handle: null,
  isLoading: false,
  unavailable: true,
};
const present: AssistantDiscovery = {
  handle: { agentId: "a", workspaceId: "w" } as never,
  isLoading: false,
  unavailable: false,
};

describe("surfaceGatesFor", () => {
  it("keeps the assistant row up while discovery is still loading", () => {
    strictEqual(
      surfaceGatesFor({
        capabilities: owner,
        isTeam: false,
        assistant: discovering,
        capabilitiesLoading: false,
      }).showAssistant,
      true,
    );
  });

  it("drops the assistant row only once discovery settles unavailable", () => {
    strictEqual(
      surfaceGatesFor({
        capabilities: owner,
        isTeam: false,
        assistant: settledAbsent,
        capabilitiesLoading: false,
      }).showAssistant,
      false,
    );
    strictEqual(
      surfaceGatesFor({
        capabilities: owner,
        isTeam: false,
        assistant: present,
        capabilitiesLoading: false,
      }).showAssistant,
      true,
    );
  });

  it("reads ready from capabilities alone, never from discovery", () => {
    strictEqual(
      surfaceGatesFor({
        capabilities: owner,
        isTeam: false,
        assistant: discovering,
        capabilitiesLoading: false,
      }).ready,
      true,
    );
    strictEqual(
      surfaceGatesFor({
        capabilities: null,
        isTeam: false,
        assistant: present,
        capabilitiesLoading: true,
      }).ready,
      false,
    );
  });

  it("requires the loading flag rather than defaulting it to settled", () => {
    // `ready: !capabilitiesLoading` over an OPTIONAL field read every caller
    // that forgot it as "the gates have settled" — the one answer that lets a
    // guard drop an owner out of a screen they can reach.
    const src = readFileSync(
      new URL("../src/lib/surface-gates-model.ts", import.meta.url),
      "utf8",
    );
    strictEqual(src.includes("capabilitiesLoading?:"), false);
  });

  it("keeps Skills to the space owner in a team workspace", () => {
    const member = { multiplayer: true, role: "user" } as never;
    const gates = surfaceGatesFor({
      capabilities: member,
      isTeam: true,
      assistant: present,
      capabilitiesLoading: false,
    });
    strictEqual(gates.showSkills, false);
    // Everyone keeps the AI Models hub; the org-level narrowing lives in the
    // screen, not the rail.
    strictEqual(gates.showAiModels, true);
    strictEqual(
      surfaceGatesFor({
        capabilities: owner,
        isTeam: true,
        assistant: present,
        capabilitiesLoading: false,
      }).showSkills,
      true,
    );
  });
});
