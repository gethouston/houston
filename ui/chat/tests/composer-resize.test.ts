import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  COMPOSER_AUTO_MAX_PX,
  COMPOSER_CHROME_RESERVE_PX,
  COMPOSER_MANUAL_MIN_PX,
  clampComposerHeight,
  composerHeightLimit,
  composerTextareaBounds,
} from "../src/composer-resize.ts";
import { fitTextareaHeight } from "../src/textarea-fit.ts";

const VIEWPORT = 900;
const LIMIT = VIEWPORT - COMPOSER_CHROME_RESERVE_PX;

describe("composer drag height", () => {
  it("keeps a dragged height in whole pixels", () => {
    assert.equal(clampComposerHeight(300.4, VIEWPORT), 300);
  });

  it("stops at the viewport minus the chrome reserve", () => {
    assert.equal(clampComposerHeight(5000, VIEWPORT), LIMIT);
  });

  it("lets go back to auto-grow under the minimum", () => {
    assert.equal(
      clampComposerHeight(COMPOSER_MANUAL_MIN_PX - 1, VIEWPORT),
      null,
    );
    assert.equal(
      clampComposerHeight(COMPOSER_MANUAL_MIN_PX, VIEWPORT),
      COMPOSER_MANUAL_MIN_PX,
    );
  });

  it("never caps below what auto-grow already reaches on a short window", () => {
    assert.equal(composerHeightLimit(300), COMPOSER_AUTO_MAX_PX);
  });
});

describe("composer textarea bounds", () => {
  it("auto: one line up to the auto cap", () => {
    assert.deepEqual(composerTextareaBounds(null, VIEWPORT), {
      minPx: 0,
      maxPx: COMPOSER_AUTO_MAX_PX,
    });
  });

  it("a small manual size is a floor and text still grows to the auto cap", () => {
    assert.deepEqual(composerTextareaBounds(120, VIEWPORT), {
      minPx: 120,
      maxPx: COMPOSER_AUTO_MAX_PX,
    });
  });

  it("a tall manual size is both floor and cap", () => {
    assert.deepEqual(composerTextareaBounds(500, VIEWPORT), {
      minPx: 500,
      maxPx: 500,
    });
  });

  it("a window shrunk after the drag pulls the composer down with it", () => {
    assert.deepEqual(composerTextareaBounds(600, 700), {
      minPx: 700 - COMPOSER_CHROME_RESERVE_PX,
      maxPx: 700 - COMPOSER_CHROME_RESERVE_PX,
    });
  });
});

describe("textarea fit", () => {
  it("grows with the content under the cap", () => {
    assert.deepEqual(fitTextareaHeight(90, 160), {
      height: 90,
      scrolls: false,
    });
  });

  it("stops at the cap and scrolls past it", () => {
    assert.deepEqual(fitTextareaHeight(400, 160), {
      height: 160,
      scrolls: true,
    });
  });

  it("holds the floor when the content is shorter", () => {
    assert.deepEqual(fitTextareaHeight(20, 208, 120), {
      height: 120,
      scrolls: false,
    });
  });
});
