import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  CARD_PEOPLE_MAX,
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

// The card people overlay (bottom-right of the card body) renders faces up to
// CARD_PEOPLE_MAX then an expandable "+N" chip. These assert the overlay's
// partition (what renders as a face vs. behind the chip) and — the founder's
// explicit ask — that the expansion still reaches EVERY contributor (faces +
// overflow === all).
describe("card people overlay partition (CARD_PEOPLE_MAX)", () => {
  it("uses a wider default than the inline stack (~5)", () => {
    assert.equal(CARD_PEOPLE_MAX, 5);
  });

  it("0 people: nothing to show", () => {
    assert.equal(visiblePeople(people(0), CARD_PEOPLE_MAX).length, 0);
    assert.equal(overflowCount(people(0), CARD_PEOPLE_MAX), 0);
  });

  it("3 people: all shown as faces, no overflow chip", () => {
    assert.equal(visiblePeople(people(3), CARD_PEOPLE_MAX).length, 3);
    assert.equal(overflowCount(people(3), CARD_PEOPLE_MAX), 0);
  });

  it("8 people: CARD_PEOPLE_MAX faces + the rest behind the chip", () => {
    const list = people(8);
    assert.equal(visiblePeople(list, CARD_PEOPLE_MAX).length, CARD_PEOPLE_MAX);
    assert.equal(overflowCount(list, CARD_PEOPLE_MAX), 8 - CARD_PEOPLE_MAX);
  });

  it("expansion reaches everyone: faces + overflow === total", () => {
    for (const n of [0, 3, 5, 8, 20]) {
      const list = people(n);
      assert.equal(
        visiblePeople(list, CARD_PEOPLE_MAX).length +
          overflowCount(list, CARD_PEOPLE_MAX),
        n,
      );
    }
  });
});
