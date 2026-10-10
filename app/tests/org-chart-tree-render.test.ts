import { match, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import type { Agent, OrgMember } from "@houston/engine-adapter";
import i18next from "i18next";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { initReactI18next } from "react-i18next";
import {
  buildOrgTree,
  type OrgTreeCaps,
  SCREEN_TREE_CAPS,
} from "../src/components/organization/org-chart-tree.ts";
import { OrgChartTreeView } from "../src/components/organization/org-chart-tree-view.tsx";
import teams from "../src/locales/en/teams.json" with { type: "json" };

// tsx compiles `ui/` sources against their own tsconfig, which names no JSX
// runtime, so their JSX comes out as classic `React.createElement` calls.
Object.assign(globalThis, { React });

const members: OrgMember[] = [
  { userId: "julian", role: "owner", displayName: "Julian Arango" },
  { userId: "sara", role: "admin", displayName: "Sara Diaz" },
  { userId: "tom", role: "user", displayName: "Tom Reed" },
];
const agent = (id: string, extra: Partial<Agent> = {}): Agent => ({
  id,
  name: `Agent ${id}`,
  folderPath: id,
  configId: "c",
  createdAt: "2026-01-01",
  access: "manager",
  ...extra,
});

const render = (
  agents: Agent[],
  personal = false,
  caps: OrgTreeCaps = SCREEN_TREE_CAPS,
) =>
  renderToStaticMarkup(
    createElement(OrgChartTreeView, {
      tree: buildOrgTree({ agents, members, name: "Acme", personal }, caps),
      onOpenBoard: () => {},
      onOpenPerson: () => {},
      onShare: () => {},
    }),
  );

const count = (html: string, pattern: RegExp) =>
  (html.match(new RegExp(pattern, "g")) ?? []).length;

before(async () => {
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["teams"],
    defaultNS: "teams",
    resources: { en: { teams } },
  });
});

describe("org chart tree rendering", () => {
  it("draws the space, every person as a button and every AI Employee as a button", () => {
    const html = render([
      agent("a", { role: "Handles the inbox" }),
      agent("b", { assignments: [{ userId: "tom", access: "user" }] }),
    ]);
    match(html, /aria-label="Org chart"/);
    match(html, />Acme</);
    match(html, /3 people, 2 AI Employees/);
    for (const name of ["Julian Arango", "Sara Diaz", "Tom Reed"])
      strictEqual(
        count(html, new RegExp(`aria-label="Open ${name} in People"`)),
        1,
      );
    match(html, /aria-label="Open Agent a&#x27;s board"/);
    match(html, /aria-label="Open Agent b&#x27;s board"/);
    match(html, /Handles the inbox/);
    // Role labels come from People's own words.
    match(html, />Owner</);
    match(html, />Manager</);
    match(html, />Member</);
  });

  it("offers Share as a visible pill", () => {
    match(
      render([agent("a")]),
      /<button[^>]*rounded-full[^>]*>.*?Share<\/button>/,
    );
  });

  it("says how many it left out past the caps", () => {
    const html = render([agent("a"), agent("b"), agent("c")], false, {
      people: 1,
      agentsPerPerson: 1,
      rootAgents: 1,
    });
    match(html, /2 more AI Employees/);
    match(html, /2 more people/);
  });

  it("says what the people left out bring with them", () => {
    const html = render(
      [agent("a", { assignments: [{ userId: "tom", access: "user" }] })],
      false,
      { people: 1, agentsPerPerson: 3, rootAgents: 3 },
    );
    match(html, /2 more people/);
    match(html, /1 AI Employee</);
    // The owner stays even though Tom has the only AI Employee.
    match(html, /aria-label="Open Julian Arango in People"/);
  });

  it("draws a personal space as its person over its AI Employees", () => {
    const html = render([agent("a"), agent("b")], true);
    match(html, /aria-label="Open Julian Arango in People"/);
    match(html, /2 AI Employees/);
    strictEqual(count(html, /aria-label="Open Sara Diaz in People"/), 0);
    strictEqual(count(html, /&#x27;s board"/), 2);
  });
});
