import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("the Skills list's section header", () => {
  const ready = read("../src/components/skills-view/skills-ready.tsx");

  it("stands over rows only, never over an empty state", () => {
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
