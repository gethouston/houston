import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  allShelvesFailed,
  capShelfSkills,
  DEFAULT_SHELVES,
  dedupeAcrossShelves,
  dedupeByOwner,
  isShelfVisible,
  SHELF_CARD_CAP,
  SHELF_GRID_CAP,
  type ShelfState,
  shelfStateFromSkills,
} from "../src/skill-marketplace-shelves-model.ts";
import type { CommunitySkill } from "../src/types.ts";

function skill(id: string, owner = "acme"): CommunitySkill {
  return { id, skillId: id, name: id, installs: 0, source: `${owner}/repo` };
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

describe("dedupeByOwner", () => {
  it("keeps each owner's FIRST skill, preserving query order", () => {
    const mixed = [
      skill("a1", "alice"),
      skill("b1", "bob"),
      skill("a2", "alice"),
      skill("c1", "carol"),
      skill("b2", "bob"),
    ];
    assert.deepEqual(
      dedupeByOwner(mixed).map((s) => s.id),
      ["a1", "b1", "c1"],
    );
  });

  it("passes an all-distinct list through unchanged", () => {
    const distinct = [skill("a", "alice"), skill("b", "bob")];
    assert.deepEqual(dedupeByOwner(distinct), distinct);
  });
});

describe("shelfStateFromSkills", () => {
  it("degrades an empty result to error so the shelf hides", () => {
    assert.deepEqual(shelfStateFromSkills([]), { status: "error" });
  });

  it("becomes ready with the capped list for a non-empty result", () => {
    const many = Array.from({ length: 10 }, (_, i) => skill(`s${i}`, `o${i}`));
    const state = shelfStateFromSkills(many);
    assert.equal(state.status, "ready");
    if (state.status === "ready") {
      assert.equal(state.skills.length, SHELF_CARD_CAP);
    }
  });

  it("never repeats an author in the preview, even when one dominates", () => {
    // 10 hits from ONE prolific author + 1 from another: the shelf shows one
    // per author, not eight near-identical rows from the same publisher.
    const dominated = [
      ...Array.from({ length: 10 }, (_, i) => skill(`a${i}`, "prolific")),
      skill("b0", "other"),
    ];
    const state = shelfStateFromSkills(dominated);
    assert.equal(state.status, "ready");
    if (state.status === "ready") {
      assert.deepEqual(
        state.skills.map((s) => s.id),
        ["a0", "b0"],
      );
    }
  });
});

describe("isShelfVisible", () => {
  it("shows loading and non-empty ready shelves, hides errored ones", () => {
    assert.equal(isShelfVisible({ status: "loading" }), true);
    assert.equal(
      isShelfVisible({ status: "ready", skills: [skill("a")] }),
      true,
    );
    assert.equal(isShelfVisible({ status: "error" }), false);
  });

  it("hides a ready shelf the cross-shelf dedupe emptied", () => {
    assert.equal(isShelfVisible({ status: "ready", skills: [] }), false);
  });
});

describe("dedupeAcrossShelves", () => {
  const shelf = (
    id: string,
    skills: ReturnType<typeof skill>[],
  ): Parameters<typeof dedupeAcrossShelves>[0][number] => ({
    id,
    title: id,
    query: id,
    state: { status: "ready", skills },
  });
  const rows = (
    resolved: ReturnType<typeof dedupeAcrossShelves>[number],
  ): string[] =>
    resolved.state.status === "ready"
      ? resolved.state.skills.map((s) => s.id)
      : [];

  it("never repeats an author across shelves, in display order", () => {
    const out = dedupeAcrossShelves([
      shelf("marketing", [skill("m1", "alice"), skill("m2", "bob")]),
      shelf("sales", [skill("s1", "alice"), skill("s2", "carol")]),
    ]);
    assert.deepEqual(rows(out[0]), ["m1", "m2"]);
    // alice already headlined marketing → sales keeps only carol's skill.
    assert.deepEqual(rows(out[1]), ["s2"]);
  });

  it("caps each shelf at the grid cap", () => {
    const many = Array.from({ length: 8 }, (_, i) => skill(`s${i}`, `o${i}`));
    const out = dedupeAcrossShelves([shelf("a", many)]);
    assert.equal(rows(out[0]).length, SHELF_GRID_CAP);
  });

  it("only RENDERED owners consume — an uncapped spare never blocks later shelves", () => {
    // Shelf A has 5 distinct authors; the 5th (eve) falls past the cap of 4,
    // so eve's skill in shelf B must still render.
    const a = ["alice", "bob", "carol", "dan", "eve"].map((o, i) =>
      skill(`a${i}`, o),
    );
    const out = dedupeAcrossShelves([
      shelf("a", a),
      shelf("b", [skill("b0", "eve")]),
    ]);
    assert.equal(rows(out[0]).length, SHELF_GRID_CAP);
    assert.deepEqual(rows(out[1]), ["b0"]);
  });

  it("empties a shelf whose every author already rendered (hidden by isShelfVisible)", () => {
    const out = dedupeAcrossShelves([
      shelf("a", [skill("a0", "alice")]),
      shelf("b", [skill("b0", "alice")]),
    ]);
    assert.deepEqual(rows(out[1]), []);
    assert.equal(isShelfVisible(out[1].state), false);
  });

  it("passes loading and errored shelves through untouched", () => {
    const loading = {
      id: "l",
      title: "l",
      query: "l",
      state: { status: "loading" as const },
    };
    const errored = {
      id: "e",
      title: "e",
      query: "e",
      state: { status: "error" as const },
    };
    const out = dedupeAcrossShelves([loading, errored]);
    assert.deepEqual(out, [loading, errored]);
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
