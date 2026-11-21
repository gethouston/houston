import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Capabilities, OrgBilling } from "@houston/engine-adapter";
import type { AssistantDiscovery } from "../src/lib/assistant-discovery-state.ts";
import { surfaceGatesFor } from "../src/lib/surface-gates-model.ts";

const owner: Capabilities = {
  multiplayer: true,
  role: "owner",
} as unknown as Capabilities;

const orgBilling = (isBillingOwner: boolean): OrgBilling => ({
  tier: "free",
  status: "active",
  lockAt: null,
  lockReason: null,
  freeSlot: true,
  isBillingOwner,
  seats: 2,
  interval: null,
  seatPriceCents: 2000,
  seatPrices: { monthlyCents: 2000, annualCents: 18000 },
  seatGraceEndsAt: null,
  renewsAt: null,
  priceNotice: null,
  paidSeats: null,
  seatsInUse: null,
  usage: null,
  routines: null,
});

const discovering: AssistantDiscovery = {
  handle: null,
  isLoading: true,
  unavailable: false,
  failure: null,
};
const settledAbsent: AssistantDiscovery = {
  handle: null,
  isLoading: false,
  unavailable: true,
  failure: null,
};
const settledFailed: AssistantDiscovery = {
  handle: null,
  isLoading: false,
  unavailable: false,
  failure: "transient",
};
const present: AssistantDiscovery = {
  handle: { agentId: "a", workspaceId: "w" } as never,
  isLoading: false,
  unavailable: false,
  failure: null,
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

  it("keeps the assistant row up when discovery keeps FAILING", () => {
    strictEqual(
      surfaceGatesFor({
        capabilities: owner,
        isTeam: false,
        assistant: settledFailed,
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
    const src = readFileSync(
      new URL("../src/lib/surface-gates-model.ts", import.meta.url),
      "utf8",
    );
    strictEqual(src.includes("capabilitiesLoading?:"), false);
  });

  it("shows Billing wherever the org bills and the caller pays or administers", () => {
    const spaces = { ...owner, spaces: true, workspaceDelete: true } as never;
    const team = surfaceGatesFor({
      capabilities: spaces,
      isTeam: true,
      assistant: present,
      capabilitiesLoading: false,
      orgBilling: orgBilling(false),
    });
    strictEqual(team.showBilling, true);
    strictEqual(team.showWorkspaceDanger, true);
    const personal = surfaceGatesFor({
      capabilities: { spaces: true } as never,
      isTeam: false,
      assistant: present,
      capabilitiesLoading: false,
      orgBilling: orgBilling(true),
    });
    strictEqual(personal.showBilling, true);
    strictEqual(personal.showWorkspaceDanger, false);
    const member = surfaceGatesFor({
      capabilities: {
        multiplayer: true,
        role: "user",
        spaces: true,
        workspaceDelete: true,
      } as never,
      isTeam: true,
      assistant: present,
      capabilitiesLoading: false,
      orgBilling: orgBilling(false),
    });
    strictEqual(member.showBilling, false);
    strictEqual(member.showWorkspaceDanger, false);
  });

  it("keeps Billing off an org without org billing", () => {
    const gates = surfaceGatesFor({
      capabilities: { ...owner, spaces: true, workspaceDelete: true } as never,
      isTeam: true,
      assistant: present,
      capabilitiesLoading: false,
      orgBilling: null,
    });
    strictEqual(gates.showBilling, false);
    strictEqual(gates.showWorkspaceDanger, true);
  });

  it("keeps the Danger zone off a deployment that cannot delete a space", () => {
    strictEqual(
      surfaceGatesFor({
        capabilities: { ...owner, spaces: true } as never,
        isTeam: true,
        assistant: present,
        capabilitiesLoading: false,
      }).showWorkspaceDanger,
      false,
    );
  });

  it("keeps the AI Models hub for every member of a team workspace", () => {
    const member = { multiplayer: true, role: "user" } as never;
    const gates = surfaceGatesFor({
      capabilities: member,
      isTeam: true,
      assistant: present,
      capabilitiesLoading: false,
    });
    strictEqual(gates.showAiModels, true);
    strictEqual("showSkills" in gates, false, "no Skills screen to gate");
  });

  it("offers API keys only where the deployment serves the public API", () => {
    const at = (capabilities: unknown) =>
      surfaceGatesFor({
        capabilities: capabilities as never,
        isTeam: false,
        assistant: present,
        capabilitiesLoading: false,
      }).showApiKeys;
    strictEqual(at({ apiKeys: true }), true);
    strictEqual(at({}), false);
    strictEqual(at(null), false);
  });

  it("keeps the skill acts that reach every employee to the space owner", () => {
    const as = (role: string) =>
      surfaceGatesFor({
        capabilities: { multiplayer: true, role } as never,
        isTeam: true,
        assistant: present,
        capabilitiesLoading: false,
      }).manageWorkspaceSkills;
    strictEqual(as("owner"), true);
    strictEqual(as("admin"), false);
    strictEqual(as("user"), false);
    strictEqual(
      surfaceGatesFor({
        capabilities: null,
        isTeam: true,
        assistant: present,
        capabilitiesLoading: true,
      }).manageWorkspaceSkills,
      false,
    );
    strictEqual(
      surfaceGatesFor({
        capabilities: null,
        isTeam: false,
        assistant: present,
        capabilitiesLoading: false,
      }).manageWorkspaceSkills,
      true,
    );
  });
});
