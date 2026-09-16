import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AgentDetailScreen } from "../src/index.ts";
import type { StoreAgentRow, StoreRoutineRow } from "../src/types.ts";

Object.assign(globalThis, { React });

const agent: StoreAgentRow = {
  id: "one",
  slug: "inbox-helper",
  name: "Inbox Helper",
  description: "Sorts the morning mail.",
  integrations: [],
  installsCount: 0,
  creator: { displayName: "Ana" },
};

const routines: StoreRoutineRow[] = [
  { id: "r1", name: "Morning digest", wakeLabel: "On a schedule" },
  {
    id: "r2",
    name: "New mail summary",
    wakeLabel: "When Gmail has a new event",
  },
];

const render = (props: Partial<Parameters<typeof AgentDetailScreen>[0]>) =>
  renderToStaticMarkup(
    React.createElement(AgentDetailScreen, {
      agent,
      skills: [],
      creator: null,
      renderBio: (description: string) => description,
      agentHref: () => "/a/inbox-helper",
      ...props,
    }),
  );

describe("AgentDetailScreen routines", () => {
  it("renders the section with the host's own rows", () => {
    const html = render({
      routines,
      renderRoutines: (rows: StoreRoutineRow[]) =>
        React.createElement(
          "ul",
          null,
          rows.map((r) =>
            React.createElement(
              "li",
              { key: r.id },
              `${r.name}: ${r.wakeLabel}`,
            ),
          ),
        ),
    });
    assert.match(html, />Routines</);
    assert.match(html, /Morning digest: On a schedule/);
    assert.match(html, /When Gmail has a new event/);
  });

  it("hides the section when the agent carries no routines", () => {
    const html = render({ routines: [], renderRoutines: () => "never" });
    assert.ok(!html.includes(">Routines<"));
  });

  it("hides the section when the host passes no renderer", () => {
    const html = render({ routines });
    assert.ok(!html.includes(">Routines<"));
  });

  it("takes a custom section label without touching the rows", () => {
    const html = render({
      routines,
      renderRoutines: () => "rows",
      labels: { routines: "Automations" },
    });
    assert.match(html, />Automations</);
  });
});
