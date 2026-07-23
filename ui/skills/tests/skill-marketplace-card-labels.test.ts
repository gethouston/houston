import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  DEFAULT_CARD_LABELS,
  resolveCardLabels,
} from "../src/skill-marketplace-card-labels.ts";

describe("resolveCardLabels", () => {
  it("provides complete English defaults", () => {
    assert.equal(DEFAULT_CARD_LABELS.installAria("Notion"), "Install Notion");
    assert.equal(
      DEFAULT_CARD_LABELS.installedAria("Notion"),
      "Notion installed",
    );
    assert.equal(DEFAULT_CARD_LABELS.installsCount(1, "1"), "1 install");
    assert.equal(DEFAULT_CARD_LABELS.installsCount(2, "2"), "2 installs");
    assert.equal(DEFAULT_CARD_LABELS.bySource("acme"), "by acme");
  });

  it("merges caller overrides over the defaults", () => {
    const l = resolveCardLabels({ bySource: (owner) => `de ${owner}` });
    assert.equal(l.bySource("acme"), "de acme");
    // Unrelated defaults survive the override.
    assert.equal(l.installAria("Notion"), "Install Notion");
    assert.equal(l.installedAria("Notion"), "Notion installed");
  });
});
