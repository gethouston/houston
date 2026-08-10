import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  filterStoreAgents,
  STORE_HOME_HERO_CLASS,
  StoreHomeScreen,
  splitFeaturedAgents,
} from "../src/index.ts";
import type { StoreAgentRow } from "../src/types.ts";

Object.assign(globalThis, { React });

const agent: StoreAgentRow = {
  id: "one",
  slug: "researcher",
  name: "Researcher",
  description: "Finds evidence",
  category: "research",
  tags: ["sources"],
  integrations: [],
  installsCount: 2,
  creator: { displayName: "Ana", handle: "ana" },
};

describe("StoreHomeScreen", () => {
  it("pins the canonical hero copy and centered display classes", () => {
    const html = renderToStaticMarkup(
      React.createElement(StoreHomeScreen, {
        rows: { agents: [], creators: [], categories: [] },
        agentHref: () => "/agent",
        creatorHref: () => "/creator",
      }),
    );
    assert.match(html, />Hire your next teammate</);
    for (const token of [
      "text-center",
      "font-light",
      "text-[clamp(32px,5vw,56px)]",
    ]) {
      assert.ok(STORE_HOME_HERO_CLASS.includes(token));
    }
  });

  it("renders results only in controlled mode — the host owns the chrome", () => {
    const html = renderToStaticMarkup(
      React.createElement(StoreHomeScreen, {
        rows: { agents: [agent], creators: [], categories: [] },
        state: {
          query: "",
          view: "agents" as const,
          sort: "installs" as const,
        },
        agentHref: () => "/agent",
        creatorHref: () => "/creator",
      }),
    );
    assert.doesNotMatch(html, />Hire your next teammate</);
    assert.doesNotMatch(html, /Search agents and creators/);
    assert.match(html, />Researcher</);
  });

  it("leads the unfiltered view with the two most-installed as featured", () => {
    const base = {
      query: "",
      view: "agents" as const,
      sort: "installs" as const,
    };
    const rows = [
      agent,
      { ...agent, id: "two", name: "Writer", installsCount: 9 },
      { ...agent, id: "three", name: "Planner", installsCount: 4 },
    ];
    const split = splitFeaturedAgents(rows, base);
    assert.deepEqual(
      split.featured.map((item) => item.id),
      ["two", "three"],
    );
    assert.deepEqual(
      split.rest.map((item) => item.id),
      ["one"],
    );
    // A search collapses back to the plain grid...
    assert.equal(
      splitFeaturedAgents(rows, { ...base, query: "writer" }).featured.length,
      0,
    );
    // ...and one installed agent alone is not a featured row.
    assert.equal(
      splitFeaturedAgents([{ ...agent, installsCount: 0 }, rows[1]], base)
        .featured.length,
      0,
    );
  });

  it("owns agent filtering and sorting", () => {
    const result = filterStoreAgents(
      [agent, { ...agent, id: "two", name: "Writer", installsCount: 5 }],
      { query: "ana", category: "research", view: "agents", sort: "installs" },
    );
    assert.deepEqual(
      result.map((item) => item.id),
      ["two", "one"],
    );
  });
});

describe("screen-level drift guard", () => {
  it("requires both Home surfaces to import StoreHomeScreen", () => {
    for (const path of [
      "../../../agentstore/src/components/home/catalog-results.tsx",
      "../../../app/src/components/store-view/store-browse.tsx",
    ]) {
      assert.match(
        readFileSync(new URL(path, import.meta.url), "utf8"),
        /import[\s\S]*StoreHomeScreen[\s\S]*from "@houston-ai\/store"/,
      );
    }
  });
});
