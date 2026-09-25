import assert from "node:assert/strict";
import test from "node:test";
import {
  choiceOwnsKey,
  countLayersAbove,
  focusWithinStep,
  isOpenLayerRole,
} from "../src/components/shell/choice-key-scope.ts";

test("a question with focus and nothing over it owns the key", () => {
  assert.equal(
    choiceOwnsKey({ trusted: true, focusWithin: true, layersAbove: 0 }),
    true,
  );
});

test("a question owns the key only with focus AND a clear top", () => {
  for (const focusWithin of [true, false]) {
    for (const layersAbove of [0, 1, 2]) {
      assert.equal(
        choiceOwnsKey({ trusted: true, focusWithin, layersAbove }),
        focusWithin && layersAbove === 0,
        `focusWithin=${focusWithin} layersAbove=${layersAbove}`,
      );
    }
  }
});

test("a key the app dispatched at itself is never the question's", () => {
  // Leaving a kept-alive screen fires a synthetic Escape at the document to
  // dismiss a portalled modal (`keep-alive-views.tsx`). A synthetic event is
  // untrusted; swallowing it leaves that modal open and the page inert.
  assert.equal(
    choiceOwnsKey({ trusted: false, focusWithin: true, layersAbove: 0 }),
    false,
  );
});

test("focus inside the question is the question's own", () => {
  assert.equal(
    focusWithinStep({
      focusNowhere: false,
      focusInStep: true,
      targetInStep: false,
    }),
    true,
  );
});

test("the key that arrived from inside counts, wherever focus sits", () => {
  assert.equal(
    focusWithinStep({
      focusNowhere: false,
      focusInStep: false,
      targetInStep: true,
    }),
    true,
  );
});

test("focus parked on nothing belongs to nobody, so the question may take it", () => {
  assert.equal(
    focusWithinStep({
      focusNowhere: true,
      focusInStep: false,
      targetInStep: false,
    }),
    true,
  );
});

test("focus held elsewhere leaves the key to whoever holds it", () => {
  assert.equal(
    focusWithinStep({
      focusNowhere: false,
      focusInStep: false,
      targetInStep: false,
    }),
    false,
  );
});

const wrapping = { containsStep: true, beforeStep: true };
const later = { containsStep: false, beforeStep: false };
const beneath = { containsStep: false, beforeStep: true };

test("the sheet around the question is not a layer above it", () => {
  assert.equal(countLayersAbove([wrapping]), 0);
});

test("a layer opened after the question is above it", () => {
  assert.equal(countLayersAbove([later]), 1);
});

test("the dialog under a popover the question lives in is beneath it", () => {
  // A card in the create sheet opens its role picker as a popover: portalled
  // after the sheet, so the sheet does not wrap the question yet sits under it.
  assert.equal(countLayersAbove([beneath, wrapping]), 0);
});

test("open layers are counted apart from the ones wrapping the question", () => {
  assert.equal(countLayersAbove([wrapping, later, beneath, later]), 2);
});

test("nothing open means nothing above", () => {
  assert.equal(countLayersAbove([]), 0);
});

test("a confirm opened over the question is a layer that takes keys", () => {
  // Radix's AlertDialog renders role="alertdialog": a confirm asked ON TOP of
  // the question owns Escape, and a question that does not count it swallows
  // the key that was meant to answer the confirm.
  assert.equal(isOpenLayerRole("alertdialog"), true);
});

test("every layer kind that covers the question is counted", () => {
  for (const role of ["dialog", "alertdialog", "menu", "listbox"]) {
    assert.equal(isOpenLayerRole(role), true, role);
  }
});

test("what merely sits beside the question is not a layer over it", () => {
  for (const role of ["tooltip", "button", "radiogroup", "", "DIALOG"]) {
    assert.equal(isOpenLayerRole(role), false, role);
  }
});
