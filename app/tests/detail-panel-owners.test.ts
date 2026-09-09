import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type PanelOwner,
  panelWideCapable,
  setPanelOwner,
} from "../src/components/shell/detail-panel-owners.ts";

const ids = (owners: PanelOwner[]) => owners.map((o) => o.id);

describe("shell detail panel ownership", () => {
  it("opens on the first claim and closes only when the last one is released", () => {
    let owners: PanelOwner[] = [];
    owners = setPanelOwner(owners, "board", true);
    deepStrictEqual(ids(owners), ["board"]);
    owners = setPanelOwner(owners, "routines", true);
    deepStrictEqual(ids(owners), ["board", "routines"]);
    owners = setPanelOwner(owners, "board", false);
    deepStrictEqual(ids(owners), ["routines"]);
    owners = setPanelOwner(owners, "routines", false);
    deepStrictEqual(owners, []);
  });

  it("lets a departing surface release its own claim without clobbering another (PRODUCT-1229)", () => {
    // The Routines tab holds the panel; a mission navigation opens the Activity
    // board's panel in the same commit. Routines going hidden must drop only
    // its own claim — the panel stays open for the board.
    const owners = setPanelOwner(
      setPanelOwner([], "routines", true),
      "board",
      true,
    );
    const afterLeave = setPanelOwner(owners, "routines", false);
    deepStrictEqual(ids(afterLeave), ["board"]);
    strictEqual(afterLeave.length > 0, true);
  });

  it("is idempotent — a repeated claim or release keeps the same array", () => {
    const owners = setPanelOwner([], "board", true);
    strictEqual(setPanelOwner(owners, "board", true), owners);
    strictEqual(setPanelOwner([], "board", false).length, 0);
  });

  // PRODUCT-1722: the wide chat is the SURFACE's consent, carried on its
  // claim. A setup interview beside its catalog never opts in, so the user's
  // wide preference cannot swallow the catalog under it.
  it("records whether a claim allows the wide layout", () => {
    const side = setPanelOwner([], "routines", true);
    strictEqual(panelWideCapable(side), false);
    const both = setPanelOwner(side, "board", true, true);
    strictEqual(panelWideCapable(both), true);
    // The board leaves: what is left is the side-only claim.
    strictEqual(panelWideCapable(setPanelOwner(both, "board", false)), false);
    strictEqual(panelWideCapable([]), false);
  });
});
