import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { setPanelOwner } from "../src/components/shell/detail-panel-owners.ts";

describe("shell detail panel ownership", () => {
  it("opens on the first claim and closes only when the last one is released", () => {
    let owners: string[] = [];
    owners = setPanelOwner(owners, "board", true);
    deepStrictEqual(owners, ["board"]);
    owners = setPanelOwner(owners, "routines", true);
    deepStrictEqual(owners, ["board", "routines"]);
    owners = setPanelOwner(owners, "board", false);
    deepStrictEqual(owners, ["routines"]);
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
    deepStrictEqual(afterLeave, ["board"]);
    strictEqual(afterLeave.length > 0, true);
  });

  it("is idempotent — a repeated claim or release keeps the same array", () => {
    const owners = setPanelOwner([], "board", true);
    strictEqual(setPanelOwner(owners, "board", true), owners);
    strictEqual(setPanelOwner([], "board", false).length, 0);
  });
});
