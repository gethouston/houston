import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  filterStoreAgents,
  STORE_HOME_HERO_CLASS,
  StoreHomeScreen,
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
