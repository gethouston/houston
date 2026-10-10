import { ok } from "node:assert";
import { describe, it } from "node:test";
import {
  CARD_PADDING,
  lineBudget,
  NAME_LINES,
  NODE,
  type StackedShape,
  stackedHeight,
} from "../src/components/organization/org-chart-share-card-geometry.ts";

describe("share card content budget", () => {
  it("fits the worst case of every stacked card inside it, halo and padding included", () => {
    for (const shape of ["column", "leaf"] as StackedShape[]) {
      for (let names = 0; names <= NAME_LINES; names++) {
        const roles = lineBudget(shape, names);
        const height = stackedHeight(shape, names, roles);
        ok(
          height + CARD_PADDING * 2 <= NODE[shape].h,
          `${shape}: ${names} name + ${roles} role lines = ${height}px in ${NODE[shape].h}px`,
        );
      }
      // The block is measured from what the mark really paints: the photo
      // or "+N" disc, or the dot's halo, whichever reaches further.
      const s = NODE[shape];
      ok(s.extent >= Math.max(s.mark, s.halo * 2), `${shape} extent`);
    }
  });

  it("keeps a leaf's role to one line, and a column's to what three lines leave", () => {
    ok(lineBudget("leaf", 2) === 1 && lineBudget("leaf", 1) === 1);
    ok(lineBudget("column", 2) === 1 && lineBudget("column", 1) === 2);
  });

  it("fits the one-line cards", () => {
    ok(NODE.root.tile + CARD_PADDING * 2 <= NODE.root.h);
    ok(NODE.moreLeaf.name + CARD_PADDING * 2 <= NODE.moreLeaf.h);
  });
});
