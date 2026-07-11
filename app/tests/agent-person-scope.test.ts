import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { KanbanPerson } from "@houston-ai/board";
import {
  buildScopeOptions,
  DEFAULT_SCOPE,
  missionMatchesScope,
  type PersonScope,
  reconcileAgentScope,
} from "../src/lib/agent-person-scope.ts";

// The per-agent header person scope: pure model. Covers the default ("me"), the
// matching semantics (incl. unattributed missions staying visible), the menu
// ordering, and the reset-to-default-on-agent-switch rule.

const me: PersonScope = { kind: "me" };
const everyone: PersonScope = { kind: "everyone" };
const person = (userId: string): PersonScope => ({ kind: "person", userId });

describe("DEFAULT_SCOPE", () => {
  it("is 'me' — the board opens on the signed-in user", () => {
    deepStrictEqual(DEFAULT_SCOPE, { kind: "me" });
  });
});

describe("reconcileAgentScope — reset to default (me) on agent switch", () => {
  it("keeps the chosen scope while the agent (path) is unchanged", () => {
    // Plain re-renders and data refreshes re-run this each frame; none may drop
    // the user's choice.
    deepStrictEqual(
      reconcileAgentScope({
        trackedPath: "/ws/AgentA",
        path: "/ws/AgentA",
        scope: person("mate"),
      }),
      person("mate"),
    );
    deepStrictEqual(
      reconcileAgentScope({
        trackedPath: "/ws/AgentA",
        path: "/ws/AgentA",
        scope: everyone,
      }),
      everyone,
    );
  });

  it("snaps back to 'me' when the agent changes, dropping the stale person", () => {
    // The leak: scoping agent A to teammate X then switching to agent B must NOT
    // carry X over (B may not have X on any mission — the board would render
    // empty under a stranger's face). Reconcile resets to the default.
    deepStrictEqual(
      reconcileAgentScope({
        trackedPath: "/ws/AgentA",
        path: "/ws/AgentB",
        scope: person("mate"),
      }),
      DEFAULT_SCOPE,
    );
    deepStrictEqual(
      reconcileAgentScope({
        trackedPath: "/ws/AgentA",
        path: "/ws/AgentB",
        scope: everyone,
      }),
      DEFAULT_SCOPE,
    );
  });
});

describe("missionMatchesScope", () => {
  const mineStack: KanbanPerson[] = [{ id: "me", label: "Me" }];
  const sharedStack: KanbanPerson[] = [
    { id: "me", label: "Me" },
    { id: "mate", label: "Mate" },
  ];
  const theirStack: KanbanPerson[] = [{ id: "mate", label: "Mate" }];

  it("everyone matches every mission (no filter)", () => {
    strictEqual(missionMatchesScope(theirStack, everyone, "me"), true);
    strictEqual(missionMatchesScope(undefined, everyone, "me"), true);
  });

  it("me matches my missions and shared missions I am on", () => {
    strictEqual(missionMatchesScope(mineStack, me, "me"), true);
    strictEqual(missionMatchesScope(sharedStack, me, "me"), true);
    strictEqual(missionMatchesScope(theirStack, me, "me"), false);
  });

  it("me keeps unattributed / legacy missions visible (empty or absent stack)", () => {
    // The load-bearing default clause: pre-Teams / unstamped missions carry no
    // people; because the board defaults to 'me', they must still show or a
    // tenured user's board would look empty on day one.
    strictEqual(missionMatchesScope(undefined, me, "me"), true);
    strictEqual(missionMatchesScope([], me, "me"), true);
  });

  it("a named person is strict — never matches unattributed work", () => {
    strictEqual(missionMatchesScope(theirStack, person("mate"), "me"), true);
    strictEqual(missionMatchesScope(mineStack, person("mate"), "me"), false);
    strictEqual(missionMatchesScope(undefined, person("mate"), "me"), false);
    strictEqual(missionMatchesScope([], person("mate"), "me"), false);
  });
});

describe("buildScopeOptions — menu ordering", () => {
  const roster: KanbanPerson[] = [
    { id: "me", label: "Me" },
    { id: "b", label: "Bea" },
    { id: "a", label: "Ana" },
  ];

  it("puts me first, then Everyone, then other contributors in roster order", () => {
    const options = buildScopeOptions(roster, "me");
    deepStrictEqual(
      options.map((o) => o.scope.kind),
      ["me", "everyone", "person", "person"],
    );
    // Self is removed from the person rows (already the first row).
    deepStrictEqual(
      options.flatMap((o) => (o.person ? [o.person.id] : [])),
      ["b", "a"],
    );
  });

  it("offers just me + Everyone when there are no other contributors", () => {
    const options = buildScopeOptions([{ id: "me", label: "Me" }], "me");
    deepStrictEqual(
      options.map((o) => o.scope.kind),
      ["me", "everyone"],
    );
  });
});
