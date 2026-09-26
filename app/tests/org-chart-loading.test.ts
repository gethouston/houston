import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { orgChartTeamsState } from "../src/components/organization/org-chart-view-model.ts";
import { personDisplayName } from "../src/components/organization/people-tab-model.ts";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("orgChartTeamsState", () => {
  it("waits on the agents the local backend groups into teams", () => {
    strictEqual(
      orgChartTeamsState({
        agentsLoaded: false,
        teamCount: 0,
      }),
      "loading",
    );
  });

  it("is empty only once a successful read found nothing", () => {
    strictEqual(
      orgChartTeamsState({
        agentsLoaded: true,
        teamCount: 0,
      }),
      "empty",
    );
  });
});

describe("personDisplayName is the one person-label rule", () => {
  it("prefers the name they set, then the email, then the caller's fallback", () => {
    strictEqual(
      personDisplayName(
        { userId: "u1", email: "ada@x.io", displayName: "Ada" },
        "Unknown",
      ),
      "Ada",
    );
    strictEqual(
      personDisplayName({ userId: "u1", email: "ada@x.io" }, "Unknown"),
      "ada@x.io",
    );
    strictEqual(personDisplayName({ userId: "u1" }, "Unknown"), "Unknown");
  });

  it("is what every surface naming a person spells", () => {
    // Directly, or through `rosterPersonName` — the member row's wrapper for
    // it, which supplies the row's own fallback (`org-members-tab.test.ts`).
    for (const rel of [
      "../src/components/organization/people-roster.tsx",
      "../src/components/organization/people-roster-confirm.tsx",
      "../src/components/organization/org-roster.ts",
      "../src/components/agent-settings/agent-person-row.tsx",
      "../src/components/agent-settings/agent-people-model.ts",
    ])
      ok(
        /\b(personDisplayName|rosterPersonName)\b/.test(read(rel)),
        `${rel} names a person through the shared helper`,
      );
    ok(
      !read("../src/components/organization/org-chart-view-model.ts").includes(
        "orgChartPersonName",
      ),
      "the org chart's private copy of the rule is gone",
    );
  });
});

describe("org chart token discipline", () => {
  it("wears the app's hairline card, not a bordered-box grid", () => {
    // DESIGN.md §6 bans the bordered card grid as filler chrome: a card is a
    // `bg-card` plane with the `.ht-hairline` inset ring (invite-card,
    // skill-editor-agents-card). One constant carries it, so the placeholder
    // and the real card cannot end up on different surfaces.
    const chrome = read("../src/components/organization/org-chart-cards.tsx");
    ok(
      /CARD_SURFACE = "ht-hairline rounded-xl bg-card/.test(chrome),
      "the card plane is the hairline treatment",
    );
    for (const rel of [
      "../src/components/organization/org-chart-team-card.tsx",
      "../src/components/organization/org-chart-cards.tsx",
    ]) {
      const src = read(rel);
      ok(src.includes("CARD_SURFACE"), `${rel} draws the shared plane`);
      ok(!/border border-line/.test(src), `${rel} draws no boxed card`);
    }
  });

  it("gives the placeholder card a line for its agents heading", () => {
    // A skeleton that omits the half-labels shifts the whole card downward
    // when the teams land (DESIGN.md §7: skeletons mirror the final layout).
    const chrome = read("../src/components/organization/org-chart-cards.tsx");
    const labels = chrome.match(/mb-2 h-4 w-\d+ rounded-full/g) ?? [];
    strictEqual(labels.length, 1, "the agents heading is held open");
  });
});
