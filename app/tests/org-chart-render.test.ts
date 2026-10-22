import { doesNotMatch, match, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import type { Agent, OrgMember, UsageRow } from "@houston/engine-adapter";
import i18next from "i18next";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { initReactI18next } from "react-i18next";
import { OrgChartAreaDrawing } from "../src/components/organization/org-chart-area-chart.tsx";
import { OrgChartHero } from "../src/components/organization/org-chart-hero.tsx";
import { OrgChartLedger } from "../src/components/organization/org-chart-ledger.tsx";
import {
  orgChartUsage,
  orgChartWork,
} from "../src/components/organization/org-chart-model.ts";
import type {
  HeroFigures,
  OrgChartScope,
} from "../src/components/organization/org-chart-scope.ts";
import {
  buildLedger,
  type LedgerColumns,
  ledgerColumns,
  orgChartLead,
} from "../src/components/organization/org-chart-view-model.ts";
import teams from "../src/locales/en/teams.json" with { type: "json" };

// tsx compiles `ui/` sources against their own tsconfig, which names no JSX
// runtime, so their JSX comes out as classic `React.createElement` calls.
Object.assign(globalThis, { React });

const NOW = new Date("2026-09-26T12:00:00Z");
const HOUR = 3_600_000;
const members: OrgMember[] = [
  { userId: "julian", role: "owner", displayName: "Julian Arango" },
  { userId: "tom", role: "user", displayName: "Tom Reed" },
  { userId: "ana", role: "user", displayName: "Ana Ruiz" },
];
const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({
  id,
  name: `Agent ${id}`,
  folderPath: id,
  configId: "c",
  createdAt: "2026-01-01",
  assignments: [{ userId: "tom", access: "user" }],
  ...extra,
});
const rows: UsageRow[] = [
  { agentSlug: "a", userId: "tom", day: "2026-09-26", messages: 12140 },
];
const computeRows = (ids: string[]) =>
  ids.map((id, i) => ({
    agentSlug: id,
    day: "2026-09-26",
    activeMs: (10 + i) * HOUR,
    awakeMs: 0,
    wakes: 1,
    turns: 1,
    routineRuns: 0,
  }));

const ledger = (
  agents: Agent[],
  columns: LedgerColumns = ledgerColumns(
    orgChartLead("ready", "ready"),
    "ready",
    false,
  ),
  phone = false,
  scope: OrgChartScope = "org",
) =>
  renderToStaticMarkup(
    createElement(OrgChartLedger, {
      lines: buildLedger(agents, members, {
        unnamedAccount: "Unnamed account",
        work: orgChartWork(agents, computeRows(agents.map((a) => a.id)), NOW),
        usage: orgChartUsage(agents, rows, NOW),
        scope,
      }),
      columns,
      phone,
      onOpenBoard: () => {},
      onOpenPerson: () => {},
    }),
  );

const count = (html: string, pattern: RegExp) =>
  (html.match(new RegExp(pattern, "g")) ?? []).length;

const figures: HeroFigures = {
  scope: "org",
  agents: 5,
  people: 3,
  workMs: 212 * HOUR,
  messages: 1649,
  messagesScoped: false,
};

before(async () => {
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["teams"],
    defaultNS: "teams",
    resources: { en: { teams } },
  });
});

describe("org chart ledger rendering", () => {
  it("draws each AI Employee as a labelled button with face buttons beside it", () => {
    const html = ledger([
      agent("a", { role: "Handles the inbox" }),
      agent("b", { assignments: undefined }),
    ]);
    match(html, /<button[^>]*aria-label="Open Agent a&#x27;s board"/);
    match(html, /<button[^>]*aria-label="Open Agent b&#x27;s board"/);
    strictEqual(
      count(html, /<button[^>]*aria-label="Open Tom Reed in People"/),
      1,
    );
    strictEqual(
      count(html, /<button[^>]*aria-label="Open Julian Arango in People"/),
      1,
    );
    match(html, /Handles the inbox/);
    match(html, /People hidden/);
    match(html, new RegExp(`12${String.fromCharCode(0x202f)}140`));
    doesNotMatch(html, /foreignObject/i);
    doesNotMatch(html, /<button[^>]*>(?:(?!<\/button>).)*<button/);
  });

  it("features the #1 on its own card, larger than the rest", () => {
    const html = ledger([agent("a"), agent("b"), agent("c")]);
    // Agent c worked the most hours, so it leads.
    match(html, /<ol[^>]*><li[^>]*rounded-2xl bg-card-solid[^>]*>.*?Agent c/);
    strictEqual(count(html, /rounded-2xl bg-card-solid/), 1);
    match(html, /Ranked by hours/);
    match(html, /<ol start="2"/);
  });

  it("names the groups and says None for an empty one", () => {
    const html = ledger([agent("a"), agent("b")]);
    match(html, />Manages</);
    match(html, />Uses</);
    const lonely = ledger([
      agent("a", { assignments: [{ userId: "julian", access: "manager" }] }),
    ]);
    match(lonely, />None</);
  });

  it("draws no people columns in a personal space", () => {
    const html = ledger(
      [agent("a"), agent("b")],
      ledgerColumns(orgChartLead("ready", "hidden"), "hidden", true),
    );
    doesNotMatch(html, /in People"/);
    doesNotMatch(html, /Manages/);
  });

  it("says Everyone once for an agent shared with the whole organization", () => {
    // The gateway omits an empty assignment list, even for its manager.
    const html = ledger([
      agent("a", { access: "manager", assignments: undefined }),
    ]);
    match(html, />Everyone</);
    strictEqual(count(html, /aria-label="Open Tom Reed in People"/), 0);
    strictEqual(count(html, /aria-label="Open Julian Arango in People"/), 1);
    doesNotMatch(html, /People hidden/);
  });

  it("says Not counted where the gateway does not count this caller's messages", () => {
    const agents = [
      agent("a", { access: "manager" }),
      agent("b", { access: "user", assignments: undefined }),
    ];
    for (const phone of [false, true]) {
      const html = ledger(
        agents,
        ledgerColumns(orgChartLead("ready", "hidden"), "ready", false),
        phone,
        "yours",
      );
      strictEqual(count(html, />Not counted</), 1);
      match(html, new RegExp(`12${String.fromCharCode(0x202f)}140`));
    }
  });

  it("holds the ledger as a skeleton while hours load, so #1 never jumps", () => {
    const html = ledger(
      [agent("a"), agent("b")],
      ledgerColumns(orgChartLead("loading", "ready"), "ready", false),
    );
    match(html, /aria-busy="true"/);
    doesNotMatch(html, /&#x27;s board"/);
  });

  it("holds the ledger while its messages lead is loading", () => {
    const html = ledger(
      [agent("a"), agent("b")],
      ledgerColumns(orgChartLead("hidden", "loading"), "loading", false),
    );
    match(html, /aria-busy="true"/);
    doesNotMatch(html, /&#x27;s board"/);
  });

  it("gives every face a target at least 24px wide that no neighbour overlaps", () => {
    const html = ledger([
      agent("a", {
        assignments: [
          { userId: "tom", access: "user" },
          { userId: "ana", access: "user" },
        ],
      }),
    ]);
    const faces = html.match(/<button[^>]*in People"[^>]*>/g) ?? [];
    strictEqual(faces.length, 3);
    for (const face of faces) {
      match(face, /\bw-6\b/);
      doesNotMatch(face, /-ml-/);
    }
  });

  it("stacks lines on the phone with the same buttons", () => {
    const agents = Array.from({ length: 10 }, (_, i) =>
      agent(String.fromCharCode(97 + i)),
    );
    const html = ledger(
      agents,
      ledgerColumns(orgChartLead("ready", "ready"), "ready", false),
      true,
    );
    strictEqual(count(html, /aria-label="Open Agent [a-j]&#x27;s board"/), 10);
    strictEqual(count(html, /aria-label="Open Tom Reed in People"/), 10);
    doesNotMatch(html, /foreignObject/i);
  });
});

describe("org chart hero rendering", () => {
  const hero = (props: Partial<Parameters<typeof OrgChartHero>[0]>) =>
    renderToStaticMarkup(
      createElement(OrgChartHero, {
        title: "Acme Studio",
        lead: orgChartLead("ready", "ready"),
        figures,
        series: { values: [1, 2, 3], from: "2026-08-28" },
        ...props,
      }),
    );

  it("reads out the team, its hours and its messages", () => {
    const html = hero({});
    match(html, /<h2[^>]*>Acme Studio<\/h2>/);
    match(html, /5 AI Employees.*and.*3 people/);
    match(html, /1.649 messages.*and.*212 hours.*of work in the last 30 days/);
    match(html, />212</);
    match(html, /Hours worked · last 30 days/);
    doesNotMatch(html, /foreignObject/i);
  });

  it("falls back to messages, honestly, when hours cannot be read", () => {
    const html = hero({
      lead: orgChartLead("hidden", "ready"),
      figures: { ...figures, workMs: null },
    });
    match(html, /Messages · last 30 days/);
    doesNotMatch(html, /hours/i);
    doesNotMatch(html, />0</);
  });

  it("draws no figure at all when nothing can be read", () => {
    const html = hero({
      lead: null,
      figures: { ...figures, workMs: null, messages: null },
      series: null,
    });
    match(html, /5 AI Employees.*and.*3 people<\/span>\.<\/p>/);
    doesNotMatch(html, /last 30 days/);
  });

  it("scopes an admin's hero to their own AI Employees", () => {
    const html = hero({
      figures: { ...figures, scope: "yours", people: null },
    });
    match(html, />Your AI Employees</);
    match(html, /Your <span[^>]*>5 AI Employees<\/span>\./);
    doesNotMatch(html, /Organization/);
    doesNotMatch(html, /people/);
  });

  it("names the person in a personal space, with no people count", () => {
    const html = hero({
      title: "Julian Arango",
      figures: { ...figures, scope: "personal", people: null },
    });
    match(html, /Personal space/);
    match(html, /<h2[^>]*>Julian Arango<\/h2>/);
    doesNotMatch(html, /Organization/);
    doesNotMatch(html, /person|people/);
  });

  it("names the managed scope of an admin's partial messages lead", () => {
    const html = hero({
      lead: orgChartLead("hidden", "ready"),
      figures: {
        ...figures,
        scope: "yours",
        people: null,
        workMs: null,
        messagesScoped: true,
      },
    });
    match(html, /to the AI Employees you manage/);
    match(html, /Messages to AI Employees you manage/);
  });
});

describe("org chart area drawing", () => {
  it("draws a sized SVG with its line and end dot, without foreignObject", () => {
    const html = renderToStaticMarkup(
      createElement(OrgChartAreaDrawing, {
        values: [1, 2, 3],
        width: 320,
        height: 96,
        label: "Messages",
      }),
    );
    match(html, /<svg[^>]*width="320"[^>]*height="96"/);
    match(html, /<polyline[^>]*class="stroke-1"/);
    match(html, /<line /);
    match(html, /<circle /);
    doesNotMatch(html, /foreignObject/i);
  });
});
