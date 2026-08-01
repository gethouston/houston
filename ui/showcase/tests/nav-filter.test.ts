import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { countSpecimens, filterTiers } from "../src/nav-filter.ts";
import type { SpecimenTier } from "../src/registry.ts";
import { specimenTiers } from "../src/registry.ts";

// The rail's filter is the only place the two-tier tree is reshaped at runtime,
// and it is pure — so it is tested against a hand-built tree where every
// expected result is readable, plus the real registry for the shapes that only
// the live tree has (an empty product area, a tier name a reader might type).

/** A tier tree small enough to assert on exactly. */
const TREE: readonly SpecimenTier[] = [
  {
    name: "Primitives",
    groups: [
      {
        name: "Overlays",
        specimens: [
          {
            id: "dialog",
            title: "Dialog",
            group: "Overlays",
            render: () => null,
          },
          {
            id: "popover",
            title: "Popover",
            group: "Overlays",
            render: () => null,
          },
        ],
      },
      {
        name: "Actions & inputs",
        specimens: [
          {
            id: "button",
            title: "Button",
            group: "Actions & inputs",
            render: () => null,
          },
        ],
      },
    ],
  },
  {
    name: "Product areas",
    groups: [
      {
        name: "Chat",
        specimens: [
          {
            id: "chat-input",
            title: "ChatInput",
            group: "Chat",
            render: () => null,
          },
        ],
      },
      { name: "Agent Store", specimens: [] },
    ],
  },
];

/** `Tier > Group > Title` for every branch a filter kept — the whole shape. */
function shapeOf(tiers: readonly SpecimenTier[]): string[] {
  return tiers.flatMap((tier) =>
    tier.groups.flatMap((group) =>
      group.specimens.length === 0
        ? [`${tier.name} > ${group.name} > (empty)`]
        : group.specimens.map(
            (one) => `${tier.name} > ${group.name} > ${one.title}`,
          ),
    ),
  );
}

describe("the rail filter", () => {
  it("returns the tree untouched for an empty query", () => {
    assert.equal(filterTiers(TREE, ""), TREE);
    assert.equal(filterTiers(TREE, "   "), TREE);
  });

  it("keeps a whole tier when the tier itself is named", () => {
    assert.deepEqual(shapeOf(filterTiers(TREE, "primitives")), [
      "Primitives > Overlays > Dialog",
      "Primitives > Overlays > Popover",
      "Primitives > Actions & inputs > Button",
    ]);
  });

  it("keeps a whole group when the group itself is named", () => {
    assert.deepEqual(shapeOf(filterTiers(TREE, "overlays")), [
      "Primitives > Overlays > Dialog",
      "Primitives > Overlays > Popover",
    ]);
  });

  it("narrows to matching titles and drops the branches left empty", () => {
    assert.deepEqual(shapeOf(filterTiers(TREE, "pop")), [
      "Primitives > Overlays > Popover",
    ]);
  });

  it("matches on a substring, case-insensitively", () => {
    assert.deepEqual(shapeOf(filterTiers(TREE, "CHATIN")), [
      "Product areas > Chat > ChatInput",
    ]);
  });

  it("ignores the whitespace a reader types around a query", () => {
    assert.deepEqual(
      shapeOf(filterTiers(TREE, "  dialog  ")),
      shapeOf(filterTiers(TREE, "dialog")),
    );
  });

  it("drops a named-but-empty area from a search, and keeps it without one", () => {
    // The areas are the map of the product, so an empty one shows in the idle
    // rail. A search must never answer with a heading that holds no result.
    assert.ok(shapeOf(TREE).includes("Product areas > Agent Store > (empty)"));
    assert.deepEqual(filterTiers(TREE, "agent store"), []);
  });

  it("answers nothing rather than a bare heading when nothing matches", () => {
    assert.deepEqual(filterTiers(TREE, "zzz"), []);
  });

  it("never invents a specimen the tree did not hold", () => {
    for (const query of ["", "o", "a", "primitives", "chat", "zzz"]) {
      assert.ok(
        countSpecimens(filterTiers(TREE, query)) <= countSpecimens(TREE),
        query,
      );
    }
  });
});

describe("the rail filter over the real registry", () => {
  it("counts the whole tree when idle", () => {
    const all = specimenTiers.flatMap((tier) =>
      tier.groups.flatMap((group) => group.specimens),
    );
    assert.equal(countSpecimens(specimenTiers), all.length);
  });

  it("finds every specimen by its own exact title", () => {
    for (const tier of specimenTiers)
      for (const group of tier.groups)
        for (const one of group.specimens) {
          const found = filterTiers(specimenTiers, one.title);
          assert.ok(
            found
              .flatMap((t) => t.groups)
              .flatMap((g) => g.specimens)
              .some((hit) => hit.id === one.id),
            `${one.title} cannot be found by typing its own name`,
          );
        }
  });

  it("keeps each declared tier findable by name", () => {
    for (const tier of specimenTiers) {
      const found = filterTiers(specimenTiers, tier.name);
      assert.deepEqual(
        found.map((one) => one.name),
        [tier.name],
        tier.name,
      );
    }
  });
});

describe("countSpecimens", () => {
  it("counts across tiers and groups, and zero for an empty tree", () => {
    assert.equal(countSpecimens(TREE), 4);
    assert.equal(countSpecimens([]), 0);
    assert.equal(
      countSpecimens([
        {
          name: "Product areas",
          groups: [{ name: "Agent Store", specimens: [] }],
        },
      ]),
      0,
    );
  });
});
