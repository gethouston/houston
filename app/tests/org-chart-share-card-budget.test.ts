import { ok } from "node:assert";
import { describe, it } from "node:test";
import {
  CARD_PADDING,
  NAME_LINES,
  NODE,
  SHARE_MIN_TYPE,
  type StackedShape,
  stackedHeight,
} from "../src/components/organization/org-chart-share-card-geometry.ts";

const SHAPES: StackedShape[] = ["column", "leaf"];

describe("share card content budget", () => {
  it("fits the worst case of every stacked card inside it, mark and padding included", () => {
    for (const shape of SHAPES) {
      // A name alone takes up to two lines; with a role, one line each.
      const cases = [
        ...Array.from({ length: NAME_LINES + 1 }, (_, n) => [n, 0]),
        [1, 1],
      ];
      for (const [names, roles] of cases) {
        const height = stackedHeight(shape, names, roles);
        ok(
          height + CARD_PADDING * 2 <= NODE[shape].h,
          `${shape}: ${names} name + ${roles} role lines = ${height}px in ${NODE[shape].h}px`,
        );
      }
    }
  });

  it("leaves no tall empty band: a full two-line card fills most of its height", () => {
    for (const shape of SHAPES) {
      const full = stackedHeight(shape, NAME_LINES);
      ok(full >= NODE[shape].h * 0.8, `${shape}: ${full} of ${NODE[shape].h}`);
    }
  });

  it("fits the one-line cards", () => {
    ok(NODE.root.tile + CARD_PADDING * 2 <= NODE.root.h);
    ok(NODE.moreLeaf.name + CARD_PADDING * 2 <= NODE.moreLeaf.h);
  });

  it("draws the +N under a person no smaller than a name", () => {
    ok(NODE.moreLeaf.name >= SHARE_MIN_TYPE.name);
  });
});
