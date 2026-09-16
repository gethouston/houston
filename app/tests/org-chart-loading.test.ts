import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  orgChartMembersState,
  orgChartTeamsState,
} from "../src/components/organization/org-chart-view-model.ts";
import { personDisplayName } from "../src/components/organization/people-tab-model.ts";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("orgChartMembersState", () => {
  it("is ready with no request to make: the roster is already in hand", () => {
    strictEqual(
      orgChartMembersState({
        readsMembers: false,
        isPending: true,
        isError: false,
      }),
      "ready",
    );
  });

  it("is loading until the membership read settles", () => {
    // A card that counts its people off `data ?? []` claims "0 people" for the
    // length of the request, which reads as an empty team rather than a
    // pending one.
    strictEqual(
      orgChartMembersState({
        readsMembers: true,
        isPending: true,
        isError: false,
      }),
      "loading",
    );
  });

  it("says the read failed rather than counting nobody", () => {
    strictEqual(
      orgChartMembersState({
        readsMembers: true,
        isPending: false,
        isError: true,
      }),
      "error",
    );
  });

  it("counts only once the read has landed", () => {
    strictEqual(
      orgChartMembersState({
        readsMembers: true,
        isPending: false,
        isError: false,
      }),
      "ready",
    );
  });
});

describe("orgChartTeamsState", () => {
  it("waits on the agents the local backend groups into teams", () => {
    strictEqual(
      orgChartTeamsState({
        agentsLoaded: false,
        teamsLoading: false,
        teamsError: false,
        teamCount: 0,
      }),
      "loading",
    );
  });

  it("waits on the server's teams instead of claiming there are none", () => {
    strictEqual(
      orgChartTeamsState({
        agentsLoaded: true,
        teamsLoading: true,
        teamsError: false,
        teamCount: 0,
      }),
      "loading",
    );
  });

  it("says the teams read failed rather than 'No teams yet'", () => {
    strictEqual(
      orgChartTeamsState({
        agentsLoaded: true,
        teamsLoading: false,
        teamsError: true,
        teamCount: 0,
      }),
      "error",
    );
  });

  it("draws the teams it already holds even if a refetch failed", () => {
    strictEqual(
      orgChartTeamsState({
        agentsLoaded: true,
        teamsLoading: false,
        teamsError: true,
        teamCount: 2,
      }),
      "ready",
    );
  });

  it("is empty only once a successful read found nothing", () => {
    strictEqual(
      orgChartTeamsState({
        agentsLoaded: true,
        teamsLoading: false,
        teamsError: false,
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
      "../src/components/organization/org-chart-people-row.tsx",
      "../src/components/organization/org-roster.ts",
      "../src/components/agent-settings/agent-person-row.tsx",
      "../src/components/agent-settings/agent-people-model.ts",
      "../src/components/team-view/team-members-model.ts",
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
  it("draws person rows on the type scale, not on arbitrary pixel sizes", () => {
    const src = read("../src/components/organization/org-chart-people-row.tsx");
    ok(!src.includes("text-[10px]"), "no off-scale 10px");
    ok(!src.includes("text-[13px]"), "no off-scale 13px");
  });

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

  it("gives the placeholder card a line for every line the real one has", () => {
    // A skeleton that omits the half-labels shifts the whole card downward
    // when the teams land (DESIGN.md §7: skeletons mirror the final layout).
    const chrome = read("../src/components/organization/org-chart-cards.tsx");
    const labels = chrome.match(/mb-2 h-4 w-\d+ rounded-full/g) ?? [];
    strictEqual(labels.length, 2, "both half-labels are held open");
  });

  it("labels a card's two halves as section headers on the type scale", () => {
    // DESIGN.md §4: section headers are `text-sm font-medium`, never the 12px
    // muted caption that reads as metadata about the rows beneath it.
    const src = read("../src/components/organization/org-chart-team-card.tsx");
    const label = src.match(/function GroupLabel[\s\S]*?\n}/)?.[0] ?? "";
    ok(label.includes("text-sm font-medium"), "the half-labels are headers");
    ok(!label.includes("text-xs"), "no 12px caption standing in for a header");
  });
});
