import assert from "node:assert/strict";
import test from "node:test";
import {
  composerSendSelector,
  TOUR_TARGETS,
  tourAnchor,
  tourSelector,
} from "../src/components/shell/workspace-tour-steps.ts";

/**
 * The anchor vocabulary is the contract between the elements that CARRY a
 * `data-tour-target` and the spotlights that QUERY one. Both sides derive from
 * the same union, so these pin that the two derivations agree: a selector must
 * match the attribute the anchor renders, or a step points at nothing.
 */

test("the selector is the attribute selector the DOM renders", () => {
  assert.equal(
    tourSelector("nav-integrations"),
    "[data-tour-target='nav-integrations']",
  );
});

test("an anchor renders exactly what its selector looks for", () => {
  for (const target of TOUR_TARGETS) {
    const attrs = tourAnchor(target);
    assert.equal(attrs["data-tour-target"], target);
    assert.equal(
      tourSelector(target),
      `[data-tour-target='${attrs["data-tour-target"]}']`,
    );
  }
});

test("every target name is unique", () => {
  assert.equal(new Set(TOUR_TARGETS).size, TOUR_TARGETS.length);
});

test("a composer's send is found inside the anchor that holds it", () => {
  // `ui/chat`'s PromptInputSubmit renders `data-composer-submit`.
  assert.equal(
    composerSendSelector("taskChat"),
    "[data-tour-target='taskChat'] [data-composer-submit]",
  );
});
