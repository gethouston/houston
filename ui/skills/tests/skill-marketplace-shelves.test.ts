import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  allShelvesFailed,
  capShelfSkills,
  DEFAULT_SHELVES,
  isShelfVisible,
  SHELF_CARD_CAP,
  SHELF_GRID_CAP,
  type ShelfState,
  shelfStateFromSkills,
} from "../src/skill-marketplace-shelves-model.ts";
import type { CommunitySkill } from "../src/types.ts";

function skill(id: string): CommunitySkill {
  return { id, skillId: id, name: id, installs: 0, source: "acme/repo" };
}

describe("DEFAULT_SHELVES", () => {
  it("is the six founder-relevant categories in order", () => {
    assert.deepEqual(
      DEFAULT_SHELVES.map((s) => s.id),
      ["marketing", "sales", "writing", "research", "legal", "productivity"],
    );
  });

  it("maps each id to a matching English title and query", () => {
    for (const shelf of DEFAULT_SHELVES) {
      assert.equal(shelf.query, shelf.id);
      assert.equal(typeof shelf.title, "string");
      assert.ok(shelf.title.length > 0);
    }
    const marketing = DEFAULT_SHELVES[0];
    assert.deepEqual(marketing, {
      id: "marketing",
      title: "Marketing",
      query: "marketing",
    });
  });
});

describe("capShelfSkills", () => {
  it("caps at the per-row maximum", () => {
    const many = Array.from({ length: 12 }, (_, i) => skill(`s${i}`));
    assert.equal(capShelfSkills(many).length, SHELF_CARD_CAP);
    assert.equal(SHELF_CARD_CAP, 8);
  });

  it("passes a short list through unchanged", () => {
    const few = [skill("a"), skill("b")];
    assert.deepEqual(capShelfSkills(few), few);
  });

  it("honours an explicit max", () => {
    const many = Array.from({ length: 5 }, (_, i) => skill(`s${i}`));
    assert.equal(capShelfSkills(many, 3).length, 3);
  });
});

describe("SHELF_GRID_CAP", () => {
  it("caps a shelf mini-grid at four rows, within the card cap", () => {
    assert.equal(SHELF_GRID_CAP, 4);
    assert.ok(SHELF_GRID_CAP <= SHELF_CARD_CAP);
  });
});

describe("shelfStateFromSkills", () => {
  it("degrades an empty result to error so the shelf hides", () => {
    assert.deepEqual(shelfStateFromSkills([]), { status: "error" });
  });

  it("becomes ready with the capped list for a non-empty result", () => {
    const many = Array.from({ length: 10 }, (_, i) => skill(`s${i}`));
    const state = shelfStateFromSkills(many);
    assert.equal(state.status, "ready");
    if (state.status === "ready") {
      assert.equal(state.skills.length, SHELF_CARD_CAP);
    }
  });
});

describe("isShelfVisible", () => {
  it("shows loading and ready shelves, hides errored ones", () => {
    assert.equal(isShelfVisible({ status: "loading" }), true);
    assert.equal(
      isShelfVisible({ status: "ready", skills: [skill("a")] }),
      true,
    );
    assert.equal(isShelfVisible({ status: "error" }), false);
  });
});

describe("allShelvesFailed", () => {
  const err: ShelfState = { status: "error" };
  const loading: ShelfState = { status: "loading" };
  const ready: ShelfState = { status: "ready", skills: [skill("a")] };

  it("is false for an empty set", () => {
    assert.equal(allShelvesFailed([]), false);
  });

  it("is true only when every shelf failed", () => {
    assert.equal(allShelvesFailed([err, err, err]), true);
    assert.equal(allShelvesFailed([err, loading, err]), false);
    assert.equal(allShelvesFailed([err, ready]), false);
  });
});
