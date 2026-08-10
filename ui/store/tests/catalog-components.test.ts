import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AgentCard,
  agentTone,
  CatalogControls,
  CreatorCard,
  FeaturedAgentCard,
} from "../src/index.ts";
import type { CreatorDirectoryRow, StoreAgentRow } from "../src/types.ts";

Object.assign(globalThis, { React });
const { createElement } = React;

const agent: StoreAgentRow = {
  id: "a1",
  slug: "inbox-zero",
  name: "Inbox Zero",
  color: null,
  icon: null,
  description: "Description",
  tagline: null,
  integrations: ["GOOGLECALENDAR"],
  creator: { displayName: "Felipe" },
  installsCount: 0,
};

describe("AgentCard", () => {
  it("assigns a stable themed tone and honors a stored palette tone", () => {
    assert.equal(agentTone(agent), agentTone({ ...agent }));
    assert.equal(
      agentTone({ ...agent, color: "forest" }),
      "var(--ht-agent-forest)",
    );
    assert.match(
      agentTone({ ...agent, color: "#ff0000" }),
      /^var\(--ht-agent-/,
    );
  });

  it("keeps the baseline quiet: New while uncounted, compact count after", () => {
    const fresh = renderToStaticMarkup(
      createElement(AgentCard, { agent, href: "/a/inbox-zero" }),
    );
    assert.match(fresh, />New</);
    const installed = renderToStaticMarkup(
      createElement(AgentCard, {
        agent: { ...agent, installsCount: 12500 },
        href: "/a/inbox-zero",
      }),
    );
    assert.match(installed, /13K/);
    assert.match(installed, /installs/);
  });

  it("says what the agent works with in logos", () => {
    const html = renderToStaticMarkup(
      createElement(AgentCard, { agent, href: "/a/inbox-zero" }),
    );
    assert.match(html, /alt="Google Calendar"/);
  });

  it("offers install as a labelled quiet affordance only when the surface can", () => {
    const withTry = renderToStaticMarkup(
      createElement(AgentCard, {
        agent,
        href: "/a/inbox-zero",
        onTry: () => {},
      }),
    );
    assert.match(withTry, /aria-label="Try it now"/);
    const without = renderToStaticMarkup(
      createElement(AgentCard, { agent, href: "/a/inbox-zero" }),
    );
    assert.doesNotMatch(without, /aria-label="Try it now"/);
  });
});

describe("CreatorCard", () => {
  const creator: CreatorDirectoryRow = {
    handle: "ana",
    displayName: "Ana Torres",
    verified: true,
    bio: "  ",
    agentsCount: 3,
    installsCount: 12500,
  };
  it("fills an empty bio and renders caller-owned navigation", () => {
    const html = renderToStaticMarkup(
      createElement(CreatorCard, {
        creator,
        href: "/creators/ana%2Fteam",
      }),
    );
    assert.match(html, /Creator on the Agent Store/);
    assert.match(html, /3 agents/);
    assert.match(html, /13K installs/);
    assert.match(html, /href="\/creators\/ana%2Fteam"/);
  });
});

describe("CatalogControls", () => {
  const props = {
    categories: [],
    view: "agents" as const,
    sort: "installs" as const,
    query: "",
    onQueryChange: () => {},
    onCategoryChange: () => {},
    onViewChange: () => {},
    onSortChange: () => {},
  };
  it("grows the search and wraps in the site's row form", () => {
    const html = renderToStaticMarkup(createElement(CatalogControls, props));
    assert.match(html, /flex-wrap/);
    assert.match(html, /flex-1/);
  });
  it("holds a fixed search and never wraps in the strip form", () => {
    const html = renderToStaticMarkup(
      createElement(CatalogControls, { ...props, variant: "strip" as const }),
    );
    assert.doesNotMatch(html, /flex-wrap/);
    assert.match(html, /w-56/);
  });
});

describe("FeaturedAgentCard", () => {
  it("hands the hero to the creator's photo when they have one", () => {
    const html = renderToStaticMarkup(
      createElement(FeaturedAgentCard, {
        agent: {
          ...agent,
          creator: { displayName: "Felipe", avatarUrl: "https://x/y.png" },
        },
        href: "/a/inbox-zero",
      }),
    );
    assert.match(html, /src="https:\/\/x\/y\.png"/);
    assert.match(html, />Inbox Zero</);
    assert.match(html, />Description</);
  });

  it("falls back to the agent's tone field without a photo", () => {
    const html = renderToStaticMarkup(
      createElement(FeaturedAgentCard, { agent, href: "/a/inbox-zero" }),
    );
    assert.match(html, /linear-gradient/);
    assert.match(html, /alt="Google Calendar"/);
  });
});
