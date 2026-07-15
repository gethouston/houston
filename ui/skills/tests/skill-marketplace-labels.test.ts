import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolveLabels } from "../src/skill-marketplace-grid-model.ts";

describe("resolveLabels", () => {
  it("defaults minQuery distinctly from typeToSearch", () => {
    const l = resolveLabels();
    // Too-short (typed 1 char) and idle (typed nothing) must read differently:
    // the old surface split these and the rewrite collapsed them.
    assert.equal(l.minQuery, "Type at least 2 characters to search");
    assert.equal(l.typeToSearch, "Type to search for skills");
    assert.notEqual(l.minQuery, l.typeToSearch);
  });

  it("lets callers override minQuery", () => {
    const l = resolveLabels({ minQuery: "custom" });
    assert.equal(l.minQuery, "custom");
    // Unrelated defaults survive the override.
    assert.equal(l.typeToSearch, "Type to search for skills");
  });
});
