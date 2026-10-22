import { doesNotMatch, match, strictEqual } from "node:assert";
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
  phone = false,
) =>
  renderToStaticMarkup(
    createElement(OrgChartTreeView, {
      tree: buildOrgTree(
        {
          unnamedAccount: "Unnamed account",
          agents,
          members,
          name: "Acme",
          personal,
        },
        caps,
      ),
      onOpenBoard: () => {},
      onOpenPerson: () => {},
      onShare: () => {},
      phone,
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
  it("draws the space, every person and every AI Employee as a face and a name", () => {
    const html = render([
      agent("a", { role: "Handles the inbox" }),
      agent("b", { assignments: [{ userId: "tom", access: "user" }] }),
    ]);
    match(html, /aria-label="Org chart"/);
    match(html, />Acme</);
    // No captions: no counts under the space, no section title.
    doesNotMatch(html, /3 people/);
    doesNotMatch(html, /Who works here/);
    for (const name of ["Julian Arango", "Sara Diaz", "Tom Reed"])
      strictEqual(
        count(html, new RegExp(`aria-label="Open ${name} in People"`)),
        1,
      );
    match(html, /aria-label="Open Agent a&#x27;s board"/);
    match(html, /aria-label="Open Agent b&#x27;s board"/);
    // Nor a role under anyone: not People's roles, not a job description.
    for (const role of [
      "Handles the inbox",
      ">Owner<",
      ">Manager<",
      ">Member<",
    ])
      doesNotMatch(html, new RegExp(role));
  });

  it("gives every card a node id the connectors measure, on both layouts", () => {
    for (const phone of [false, true]) {
      const html = render(
        [agent("a", { assignments: [{ userId: "tom", access: "user" }] })],
        false,
        SCREEN_TREE_CAPS,
        phone,
      );
      for (const id of ["root", "p:julian", "p:sara", "p:tom", "a:a"])
        match(html, new RegExp(`data-tree-node="${id}"`));
      // Every card joins the one-time reveal.
      strictEqual(count(html, /data-reveal=""/), 5);
      match(html, /<svg[^>]*aria-hidden="true"/);
    }
  });

  it("presses in on tap, animating transform alone", () => {
    const html = render([agent("a")]);
    match(html, /active:scale-\[0\.97\]/);
    match(html, /class="[^"]*transition-transform[^"]*active:scale-\[0\.97\]/);
    // Timing only inline: a transition-property there would shadow `scale`.
    match(
      html,
      /style="transition-duration:160ms;transition-timing-function:cubic-bezier/,
    );
    strictEqual(count(html, /transition-property/), 0);
    strictEqual(count(html, /transition-all/), 0);
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
    // Said once, "+2 people", never a "+2" beside "2 more people".
    match(html, />\+2 AI Employees</);
    match(html, />\+2 people</);
    strictEqual(count(html, />\+2</), 0);
  });

  it("counts the people left out, with no line under the count", () => {
    const html = render(
      [agent("a", { assignments: [{ userId: "tom", access: "user" }] })],
      false,
      { people: 1, agentsPerPerson: 3, rootAgents: 3 },
    );
    match(html, />\+2 people</);
    doesNotMatch(html, /1 AI Employee</);
    // The owner stays even though Tom has the only AI Employee.
    match(html, /aria-label="Open Julian Arango in People"/);
  });

  it("draws a personal space as its person over its AI Employees", () => {
    const html = render([agent("a"), agent("b")], true);
    match(html, /aria-label="Open Julian Arango in People"/);
    doesNotMatch(html, /2 AI Employees/);
    strictEqual(count(html, /aria-label="Open Sara Diaz in People"/), 0);
    strictEqual(count(html, /&#x27;s board"/), 2);
  });
});
