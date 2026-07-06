import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import {
  type AgentAdminCard,
  agentAdminCards,
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

const multiplayer = (role: OrgRole): Capabilities =>
  caps({ multiplayer: true, role });

type AgentAccess = "manager" | "user";
const cardIds = (cards: AgentAdminCard[]) => cards.map((c) => c.id);
const rowsOf = (cards: AgentAdminCard[], id: string) =>
  cards.find((c) => c.id === id)?.rows ?? null;

describe("agentAdminCards — card + row visibility", () => {
  it("single-player: Configuration + General only, no Access, no template", () => {
    for (const access of ["manager", "user", undefined] as const) {
      const cards = agentAdminCards(caps(), { access });
      deepStrictEqual(cardIds(cards), ["configuration", "general"]);
      deepStrictEqual(rowsOf(cards, "general"), ["general"]);
      strictEqual(
        cards.some((c) => c.id === "access"),
        false,
      );
    }
    // A null capabilities host (legacy / pre-Teams) behaves the same.
    deepStrictEqual(cardIds(agentAdminCards(null, { access: undefined })), [
      "configuration",
      "general",
    ]);
  });

  it("Configuration always carries the four config rows", () => {
    for (const c of [caps(), multiplayer("owner"), multiplayer("user")]) {
      deepStrictEqual(
        rowsOf(agentAdminCards(c, { access: "manager" }), "configuration"),
        ["instructions", "skills", "knowledge", "model"],
      );
    }
  });

  it("multiplayer owner: Access card + template row", () => {
    const cards = agentAdminCards(multiplayer("owner"), { access: undefined });
    deepStrictEqual(cardIds(cards), ["configuration", "access", "general"]);
    deepStrictEqual(rowsOf(cards, "access"), ["people", "integrations"]);
    deepStrictEqual(rowsOf(cards, "general"), ["general", "template"]);
  });

  it("multiplayer agent-manager (access=manager): Access card + template row", () => {
    for (const role of ["admin", "user"] as const) {
      const cards = agentAdminCards(multiplayer(role), { access: "manager" });
      deepStrictEqual(cardIds(cards), ["configuration", "access", "general"]);
      deepStrictEqual(rowsOf(cards, "general"), ["general", "template"]);
    }
  });

  it("multiplayer non-manager: Access card shows but NO template row", () => {
    for (const role of ["admin", "user"] as const) {
      for (const access of ["user", undefined] as AgentAccess[]) {
        const cards = agentAdminCards(multiplayer(role), { access });
        deepStrictEqual(cardIds(cards), ["configuration", "access", "general"]);
        deepStrictEqual(rowsOf(cards, "general"), ["general"]);
      }
    }
  });
});

describe("targetToScreen — deep-link mapping", () => {
  it("maps learnings to the knowledge screen, others pass through", () => {
    strictEqual(targetToScreen("instructions"), "instructions");
    strictEqual(targetToScreen("skills"), "skills");
    strictEqual(targetToScreen("learnings"), "knowledge");
  });
});
