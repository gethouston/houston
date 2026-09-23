import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * What the Skills list draws AROUND its rows. The node runner has no DOM, so
 * the composition is guarded on source (the repo's React-test idiom); the rule
 * the composition reads is unit-tested in `skills-list-model.test.ts`.
 */
const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("the Skills list's section header", () => {
  const ready = read("../src/components/skills-view/skills-ready.tsx");

  it("stands over rows only, never over an empty state", () => {
    // "Your skills 0" above "No skills yet" titles an absence and counts it.
    ok(ready.includes("skillsListShowsRows"), "reads the one rows rule");
    ok(
      /skillsListShowsRows\(installedCount\)\s*\?/.test(ready),
      "the shell with the heading and the count is the rows branch",
    );
  });

  it("still gives the empty state the surface's tools", () => {
    ok(ready.includes("<PageHeaderTools>"), "search and Create stay reachable");
  });
});

describe("the Skills list's skeleton", () => {
  const states = read("../src/components/skills-view/skills-list-states.tsx");

  it("reserves the controls row the landed state puts in its place", () => {
    // Below the header's one-row threshold the controls stand in the BODY, so
    // a skeleton without them lets search and Create shove the rows down.
    ok(
      states.includes("<PageHeaderTools>"),
      "the same strip-or-body ownership the controls have",
    );
    ok(
      states.includes("<HeaderToolsRow"),
      "the same container, so the two rows cannot drift apart",
    );
  });

  it("mirrors the row with classes, not a structural fork", () => {
    ok(!states.includes("useIsMobile"), "no phone fork for a layout row");
  });
});
