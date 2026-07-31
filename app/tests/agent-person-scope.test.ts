import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { KanbanPerson } from "@houston-ai/board";
import {
  buildScopeOptions,
  DEFAULT_SCOPE,
  missionMatchesScope,
  type PersonScope,
} from "../src/lib/agent-person-scope.ts";

// The per-agent header person scope: pure model. Covers the default
// ("everyone"), the matching semantics (incl. unattributed missions staying
// visible under "me"), the menu and ordering.

const me: PersonScope = { kind: "me" };
const everyone: PersonScope = { kind: "everyone" };
const person = (userId: string): PersonScope => ({ kind: "person", userId });

describe("DEFAULT_SCOPE", () => {
  it("is 'everyone' — the board opens unfiltered", () => {
    deepStrictEqual(DEFAULT_SCOPE, { kind: "everyone" });
  });

  it("hides nothing on a fresh board, whatever the attribution", () => {
    const theirs: KanbanPerson[] = [{ id: "mate", label: "Mate" }];
    strictEqual(missionMatchesScope(theirs, DEFAULT_SCOPE, "me"), true);
    strictEqual(missionMatchesScope(undefined, DEFAULT_SCOPE, "me"), true);
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
    // The load-bearing clause: pre-Teams / unstamped missions carry no people,
    // and off multiplayer none do; picking 'me' must not blank the board.
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

  it("puts Everyone first, then me, then other contributors in roster order", () => {
    const options = buildScopeOptions(roster, "me");
    deepStrictEqual(
      options.map((o) => o.scope.kind),
      ["everyone", "me", "person", "person"],
    );
    // Self is removed from the person rows (already the second row).
    deepStrictEqual(
      options.flatMap((o) => (o.person ? [o.person.id] : [])),
      ["b", "a"],
    );
  });

  it("leads with the default scope", () => {
    deepStrictEqual(buildScopeOptions(roster, "me")[0]?.scope, DEFAULT_SCOPE);
  });

  it("offers just Everyone + me when there are no other contributors", () => {
    const options = buildScopeOptions([{ id: "me", label: "Me" }], "me");
    deepStrictEqual(
      options.map((o) => o.scope.kind),
      ["everyone", "me"],
    );
  });
});
