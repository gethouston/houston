import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/shell/agent-sidebar-items.tsx", import.meta.url),
  "utf8",
);

describe("buildAgentSidebarItems needs-you signal", () => {
  it("builds the signal from the summary count and localized label", () => {
    assert.match(source, /summary\.needsYouCount > 0/);
    assert.match(source, /needsYouLabel\(summary\.needsYouCount\)/);
  });

  it("always renders the signal in the row's plain trailing slot", () => {
    assert.doesNotMatch(source, /menuFor|affordance/);
    assert.match(source, /needsYou\n\s+\? \{\n\s+trailing:/);
    assert.match(source, /count=\{needsYou\.count\}/);
  });
});
