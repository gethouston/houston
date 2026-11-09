import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  firstPaintSizes,
  measureAll,
  type SizedDoc,
} from "../src/page-sizes.ts";

function doc(sizes: ({ width: number; height: number } | Error)[]) {
  const asked: number[] = [];
  let destroyed = false;
  const d: SizedDoc = {
    numPages: sizes.length,
    getPage: async (n) => {
      asked.push(n);
      const size = sizes[n - 1];
      if (!size || size instanceof Error) throw size ?? new Error("no page");
      return { getViewport: () => size };
    },
    loadingTask: {
      destroy: async () => {
        destroyed = true;
      },
    },
  };
  return { d, asked, destroyed: () => destroyed };
}

const A4 = { width: 595, height: 842 };
const WIDE = { width: 960, height: 540 };

describe("page sizes", () => {
  it("paints first from page 1 alone", async () => {
    const { d, asked } = doc([WIDE, WIDE, A4]);
    assert.deepEqual(await firstPaintSizes(d), [WIDE, WIDE, WIDE]);
    assert.deepEqual(asked, [1]);
  });

  it("destroys a document whose first page cannot be read", async () => {
    const { d, destroyed } = doc([new Error("bad page")]);
    await assert.rejects(firstPaintSizes(d), /bad page/);
    assert.equal(destroyed(), true);
  });

  it("corrects the guess once every page is measured", async () => {
    const { d } = doc([WIDE, A4, new Error("bad page")]);
    const guess = await firstPaintSizes(d);
    assert.deepEqual(await measureAll(d, guess), [WIDE, A4, WIDE]);
  });

  it("answers null when every page matched the guess", async () => {
    const { d } = doc([WIDE, WIDE]);
    assert.equal(await measureAll(d, await firstPaintSizes(d)), null);
  });
});
