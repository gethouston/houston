import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Agent Settings a11y guards. The node test runner has no DOM, so (per the
 * repo's React-test idiom) these assert on component source:
 *
 *  1. AccessChoice moves DOM focus to the newly-selected radio on arrow keys
 *     (WAI-ARIA roving-tabindex contract: focus follows selection).
 *  2. The master-detail Agent Settings page renders no <h1> (the minimal
 *     sidebar rail dropped its page title); the right-pane section titles are
 *     <h2>, not <h1>s.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("Agent Settings a11y", () => {
  it("AccessChoice focuses the newly-selected radio on arrow keys", () => {
    const src = read("../src/components/tabs/agent-admin/access-choice.tsx");
    ok(src.includes(".focus()"), "arrow-key handler moves DOM focus");
    ok(src.includes("useRef"), "keeps element refs to focus the checked radio");
  });

  it("the tab renders no <h1>; sections use <h2>", () => {
    const sidebar = read(
      "../src/components/tabs/agent-admin/agent-admin-sidebar.tsx",
    );
    ok(!sidebar.includes("<h1"), "sidebar rail renders no page-level h1");

    const models = read(
      "../src/components/tabs/agent-admin/agent-models-section.tsx",
    );
    ok(!models.includes("<h1"), "models section title is not an h1");
    ok(models.includes("<h2"), "models section title is an h2");

    const allowlist = read(
      "../src/components/tabs/agent-integrations/agent-allowlist-section.tsx",
    );
    ok(!allowlist.includes("<h1"), "allowlist section title is not an h1");
    ok(allowlist.includes("<h2"), "allowlist section title is an h2");
  });
});
