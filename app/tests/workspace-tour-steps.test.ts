import assert from "node:assert/strict";
import test from "node:test";
import {
  composerSendSelector,
  TOUR_TARGETS,
  tourAnchor,
  tourSelector,
} from "../src/components/shell/workspace-tour-steps.ts";

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
  assert.equal(
    composerSendSelector("taskChat"),
    "[data-tour-target='taskChat'] [data-composer-submit]",
  );
});
