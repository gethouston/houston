import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  CARD_PEOPLE_MAX,
  initialsFor,
  overflowCount,
  peopleGutterClass,
  stackSlots,
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

  // The helper slices by code point, not by UTF-16 code unit: a label starting
  // with an astral character (emoji, rare CJK) would otherwise be cut
  // mid-surrogate-pair and render as "�".
  it("never splits an astral character", () => {
    // Single word: the first TWO code points, both intact.
    assert.equal(initialsFor("🚀🛰️mission"), "🚀🛰");
    // Multi-word: first code point of the first and last word.
    assert.equal(initialsFor("🚀 Lovelace"), "🚀L");
    assert.equal(initialsFor("Ada 🛰️"), "A🛰");
    assert.equal(initialsFor("𝒜lan 𝒯uring"), "𝒜𝒯");
    for (const label of ["🚀🛰️mission", "🚀 Lovelace", "Ada 🛰️"]) {
      assert.ok(!initialsFor(label).includes("�"), label);
    }
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

// The stack floats over the card body's bottom-right corner, so the body has to
// reserve room for it or the description's last line runs under the faces.
describe("stackSlots", () => {
  it("counts the visible faces when nothing overflows", () => {
    assert.equal(stackSlots(people(0), CARD_PEOPLE_MAX), 0);
    assert.equal(stackSlots(people(1), CARD_PEOPLE_MAX), 1);
    assert.equal(stackSlots(people(5), CARD_PEOPLE_MAX), 5);
  });

  it("counts the '+N' chip as one more circle", () => {
    assert.equal(stackSlots(people(6), CARD_PEOPLE_MAX), CARD_PEOPLE_MAX + 1);
    assert.equal(stackSlots(people(40), CARD_PEOPLE_MAX), CARD_PEOPLE_MAX + 1);
  });
});

describe("peopleGutterClass", () => {
  it("reserves nothing for an unattributed card", () => {
    assert.equal(peopleGutterClass(0), "");
    assert.equal(peopleGutterClass(-1), "");
  });

  it("grows one spacing-scale step per circle", () => {
    assert.equal(peopleGutterClass(1), "pr-6");
    assert.equal(peopleGutterClass(2), "pr-10");
    assert.equal(peopleGutterClass(3), "pr-12");
    assert.equal(peopleGutterClass(4), "pr-16");
    assert.equal(peopleGutterClass(5), "pr-20");
    assert.equal(peopleGutterClass(6), "pr-24");
  });

  // DESIGN.md §4 sanctions one spacing scale; a gutter is spacing like any
  // other, so the ladder may only step through it (rounding up, never down —
  // extra clearance is free, a short gutter puts text under a face).
  it("only uses steps on the sanctioned spacing scale", () => {
    const SPACING_SCALE = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64];
    for (let n = 1; n <= CARD_PEOPLE_MAX + 1; n++) {
      const step = Number(peopleGutterClass(n).slice("pr-".length));
      assert.ok(SPACING_SCALE.includes(step), `pr-${step} is off the scale`);
    }
  });

  it("saturates past the widest stack the card can paint", () => {
    // CARD_PEOPLE_MAX faces + the "+N" chip is the most circles that exist.
    assert.equal(peopleGutterClass(CARD_PEOPLE_MAX + 1), peopleGutterClass(99));
  });

  it("only ever emits padding utilities, never a raw length", () => {
    for (let n = 0; n <= 8; n++) {
      const cls = peopleGutterClass(n);
      if (cls === "") continue;
      assert.match(cls, /^pr-\d+$/);
    }
  });

  it("clears the stack it is sized against (18px circle, -6px overlap, 2px ring)", () => {
    // Painted width of N ringed, overlapping circles.
    const painted = (slots: number) => slots * 12 + 10;
    const px = (cls: string) => Number(cls.slice("pr-".length)) * 4;
    for (let slots = 1; slots <= CARD_PEOPLE_MAX + 1; slots++) {
      assert.ok(
        px(peopleGutterClass(slots)) >= painted(slots),
        `gutter for ${slots} circles is narrower than the stack`,
      );
    }
  });
});
