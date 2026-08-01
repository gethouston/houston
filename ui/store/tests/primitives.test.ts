import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  storeDensity,
  storeLayout,
  storeMotion,
  storeSurface,
  storeType,
} from "../src/primitives.ts";

const everyClass = [
  ...Object.values(storeLayout),
  ...Object.values(storeType),
  ...Object.values(storeSurface),
  ...Object.values(storeDensity),
  storeMotion,
].join(" ");

describe("the store design language", () => {
  it("never hardcodes a colour — every surface resolves a --ht-* token", () => {
    assert.equal(/#[0-9a-f]{3,8}\b/i.test(everyClass), false, everyClass);
    assert.equal(/\brgba?\(/.test(everyClass), false, everyClass);
  });

  it("ships no shadows: depth is the surface ladder plus a hairline", () => {
    assert.equal(/\bshadow-/.test(everyClass), false, everyClass);
  });

  it("never animates layout — colour and border only, 150ms ease-out", () => {
    assert.equal(everyClass.includes("transition-all"), false);
    assert.equal(everyClass.includes("transition-transform"), false);
    assert.match(storeMotion, /transition-colors duration-150 ease-out/);
  });

  it("moves nothing on hover — no lift, no translate, no scale", () => {
    assert.equal(/hover:(translate|scale|-translate)/.test(everyClass), false);
  });

  it("holds the 1040px measure and the 24 / 32px gutters", () => {
    assert.match(storeLayout.container, /max-w-\[1040px\]/);
    assert.match(storeLayout.container, /\bpx-6\b/);
    assert.match(storeLayout.container, /\bmd:px-8\b/);
  });

  it("keeps the density contract: 24px cards and grid, 16px list rows", () => {
    assert.match(storeSurface.card, /\bp-6\b/);
    assert.match(storeDensity.grid, /\bgap-6\b/);
    assert.match(storeDensity.list, /\bgap-4\b/);
  });

  it("rations the accent to the primary CTA", () => {
    const accented = Object.entries(storeSurface).filter(([, value]) =>
      value.includes("bg-action"),
    );
    assert.deepEqual(
      accented.map(([key]) => key),
      ["ctaPrimary"],
    );
  });
});
