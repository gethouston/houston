import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/shell/agent-sidebar-items.tsx", import.meta.url),
  "utf8",
);

describe("buildAgentSidebarItems", () => {
  it("builds the needs-you count from the summary and localized label", () => {
    assert.match(source, /summary\.needsYouCount > 0/);
    assert.match(source, /label=\{needsYouLabel\(summary\.needsYouCount\)\}/);
  });

  it("lays the row out like a message list: line, then count", () => {
    assert.match(source, /subtitle: <AgentRowLineText line=\{line\} \/>/);
    assert.doesNotMatch(source, /meta:/);
    assert.match(source, /trailing: \(\s*<NeedsYouChip/);
  });

  it("marks an employee whose first day is ahead as New, in the count's place", () => {
    assert.match(
      source,
      /line\.kind === "firstDay"\s*\? \{ trailing: <NewAgentChip label=\{newLabel\} \/> \}/,
    );
  });

  it("keeps the row one target: its actions live in the agent's Settings", () => {
    assert.doesNotMatch(source, /affordance:/);
  });

  it("builds its second line from in-hand data, never a job description", () => {
    assert.match(
      source,
      /agentRowLine\(agent, summary, invitesFirstDay\(agent\)\)/,
    );
    assert.doesNotMatch(source, /instructions|CLAUDE\.md|readFile/);
  });
});
