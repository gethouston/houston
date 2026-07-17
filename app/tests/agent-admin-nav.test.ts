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

const cardIds = (cards: AgentAdminCard[]) => cards.map((c) => c.id);
const rowsOf = (cards: AgentAdminCard[], id: string) =>
  cards.find((c) => c.id === id)?.rows ?? null;

describe("agentAdminCards — card + row visibility", () => {
  it("single-player: Configuration only, no Access", () => {
    deepStrictEqual(cardIds(agentAdminCards(caps())), ["configuration"]);
    strictEqual(
      agentAdminCards(caps()).some((c) => c.id === "access"),
      false,
    );
    // A null capabilities host (legacy / pre-Teams) behaves the same.
    deepStrictEqual(cardIds(agentAdminCards(null)), ["configuration"]);
  });

  it("Configuration always carries the three config rows (no model)", () => {
    for (const c of [caps(), multiplayer("owner"), multiplayer("user")]) {
      deepStrictEqual(rowsOf(agentAdminCards(c), "configuration"), [
        "instructions",
        "skills",
        "knowledge",
      ]);
    }
  });

  it("single-player has no model row anywhere (model moved to Access)", () => {
    for (const cards of [agentAdminCards(caps()), agentAdminCards(null)]) {
      const allRows = cards.flatMap((c) => c.rows);
      strictEqual(allRows.includes("model"), false);
    }
  });

  it("multiplayer: adds the Access card (people only — ceilings moved to Permissions)", () => {
    for (const role of ["owner", "admin", "user"] as const) {
      const cards = agentAdminCards(multiplayer(role));
      deepStrictEqual(cardIds(cards), ["configuration", "access"]);
      deepStrictEqual(rowsOf(cards, "access"), ["people"]);
    }
  });

  it("public API gateway (apiKeys): adds the Connect card, last", () => {
    deepStrictEqual(cardIds(agentAdminCards(caps({ apiKeys: true }))), [
      "configuration",
      "connect",
    ]);
    deepStrictEqual(
      cardIds(agentAdminCards(multiplayer("owner"))).includes("connect"),
      false,
    );
    const hosted = agentAdminCards(
      caps({ multiplayer: true, role: "owner", apiKeys: true }),
    );
    deepStrictEqual(cardIds(hosted), ["configuration", "access", "connect"]);
    deepStrictEqual(rowsOf(hosted, "connect"), ["connect"]);
  });

  it("no Connect card off-cloud (absent/false flag, null caps)", () => {
    for (const c of [caps(), caps({ apiKeys: false }), null]) {
      strictEqual(
        agentAdminCards(c).some((card) => card.id === "connect"),
        false,
      );
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
