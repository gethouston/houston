import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AgentCard, agentTone, CreatorCard } from "../src/index.ts";
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

  it("shows skill and compact install metadata", () => {
    const one = renderToStaticMarkup(
      createElement(AgentCard, {
        agent: { ...agent, skills: [{ slug: "one" }] },
        href: "/a/inbox-zero",
      }),
    );
    assert.match(one, /1 skill/);
    assert.match(one, /New/);
    const installed = renderToStaticMarkup(
      createElement(AgentCard, {
        agent: { ...agent, installsCount: 12500 },
        href: "/a/inbox-zero",
      }),
    );
    assert.match(installed, /13K installs/);
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
