import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  type TeamIdentityDraft,
  teamIdentitySaveWrites,
} from "../src/components/shell/team-identity-save.ts";

/**
 * The edit dialog's save is a DIFF against what the form was seeded with, and
 * clearing must be expressible: the old rail submenu had a "Default" entry
 * that cleared a team's icon and colour, and the unified dialog keeps that
 * power by deselecting (the wire spells a clear as an explicit `null`).
 */
describe("teamIdentitySaveWrites", () => {
  const seed = (over: Partial<TeamIdentityDraft> = {}): TeamIdentityDraft => ({
    name: "Sales",
    icon: "briefcase",
    colorId: "teal",
    ...over,
  });

  it("writes nothing when nothing changed", () => {
    assert.deepEqual(teamIdentitySaveWrites(seed(), seed()), {});
  });

  it("renames on a changed, trimmed name only", () => {
    assert.deepEqual(
      teamIdentitySaveWrites(seed(), seed({ name: "  Sales  " })),
      {},
    );
    assert.deepEqual(
      teamIdentitySaveWrites(seed(), seed({ name: " Growth " })),
      {
        rename: "Growth",
      },
    );
  });

  it("patches only the identity half that changed", () => {
    assert.deepEqual(teamIdentitySaveWrites(seed(), seed({ icon: "rocket" })), {
      patch: { icon: "rocket" },
    });
    assert.deepEqual(
      teamIdentitySaveWrites(seed(), seed({ colorId: "rose" })),
      {
        patch: { color: "rose" },
      },
    );
  });

  it("spells a DESELECTED icon or colour as an explicit null clear", () => {
    assert.deepEqual(
      teamIdentitySaveWrites(seed(), seed({ icon: undefined })),
      {
        patch: { icon: null },
      },
    );
    assert.deepEqual(
      teamIdentitySaveWrites(seed(), seed({ colorId: undefined })),
      { patch: { color: null } },
    );
  });

  it("never clears what the form never held", () => {
    // A server team may store a raw hex this palette cannot name: it seeds as
    // undefined, and an untouched undefined must NOT become a null that wipes
    // the colour the user never touched.
    const raw = seed({ colorId: undefined });
    assert.deepEqual(teamIdentitySaveWrites(raw, { ...raw, name: "Ops" }), {
      rename: "Ops",
    });
  });

  it("combines a rename with clears in one save", () => {
    assert.deepEqual(
      teamIdentitySaveWrites(seed(), {
        name: "Ops",
        icon: undefined,
        colorId: "umber",
      }),
      { rename: "Ops", patch: { icon: null, color: "umber" } },
    );
  });
});
