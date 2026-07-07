import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  initialsFor,
  overflowCount,
  visiblePeople,
} from "../src/kanban-people-logic.ts";
import type { KanbanPerson } from "../src/types.ts";

const person = (id: string, label: string): KanbanPerson => ({ id, label });

const people = (n: number): KanbanPerson[] =>
  Array.from({ length: n }, (_, i) => person(`u${i}`, `User ${i}`));

describe("initialsFor", () => {
  it("takes first + last word initials for multi-word names", () => {
    assert.equal(initialsFor("Ada Lovelace"), "AL");
    assert.equal(initialsFor("Grace Brewster Hopper"), "GH");
  });

  it("takes the first two letters of a single word", () => {
    assert.equal(initialsFor("Cher"), "CH");
    assert.equal(initialsFor("Jo"), "JO");
  });

  it("uppercases the result", () => {
    assert.equal(initialsFor("ada lovelace"), "AL");
  });

  it("collapses extra whitespace", () => {
    assert.equal(initialsFor("  Ada   Lovelace  "), "AL");
  });

  it("falls back to '?' for empty/whitespace input", () => {
    assert.equal(initialsFor(""), "?");
    assert.equal(initialsFor("   "), "?");
  });
});

describe("visiblePeople", () => {
  it("returns the first `max` people", () => {
    const list = people(5);
    assert.deepEqual(
      visiblePeople(list, 3).map((p) => p.id),
      ["u0", "u1", "u2"],
    );
  });

  it("returns everyone when fewer than `max`", () => {
    assert.equal(visiblePeople(people(2), 3).length, 2);
  });

  it("returns none for a non-positive `max`", () => {
    assert.equal(visiblePeople(people(5), 0).length, 0);
    assert.equal(visiblePeople(people(5), -1).length, 0);
  });
});

describe("overflowCount", () => {
  it("counts people hidden beyond `max`", () => {
    assert.equal(overflowCount(people(5), 3), 2);
  });

  it("is zero when everyone is visible", () => {
    assert.equal(overflowCount(people(3), 3), 0);
    assert.equal(overflowCount(people(1), 3), 0);
  });

  it("never goes negative", () => {
    assert.equal(overflowCount(people(0), 3), 0);
  });
});
