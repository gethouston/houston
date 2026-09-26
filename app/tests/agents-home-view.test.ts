import { match } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const view = readFileSync(
  new URL(
    "../src/components/agents-home/agents-home-view.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("phone Agents home", () => {
  // The missions screen holds per-employee UI state (settings pane, filter,
  // search, archived toggle); drilling from one employee into another must
  // start that state fresh instead of carrying it across.
  it("remounts the missions screen for each drilled employee", () => {
    match(view, /<AgentMissionsScreen\s+key=\{agent\.id\}\s+agent=\{agent\}/);
  });
});
