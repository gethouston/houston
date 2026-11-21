import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  agentsByPath,
  missionCardAgentName,
} from "../src/components/board/mission-card-agent.ts";
import type { Agent } from "../src/lib/types.ts";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const agent = (id: string, name: string, folderPath: string): Agent =>
  ({ id, name, folderPath, color: `${id}-color` }) as Agent;

const ROSTER = [
  agent("a1", "Kai", "houston:a1"),
  agent("a2", "Marisol", "houston:a2"),
];

describe("missionCardAgentName", () => {
  const byPath = agentsByPath(ROSTER);

  it("names the OWNING agent, from the path the card carries", () => {
    assert.equal(missionCardAgentName(byPath, "houston:a1", "Houston"), "Kai");
    assert.equal(
      missionCardAgentName(byPath, "houston:a2", "Houston"),
      "Marisol",
    );
  });

  it("beats the row's own name even when the row has one", () => {
    assert.equal(missionCardAgentName(byPath, "houston:a1", "Houston"), "Kai");
  });

  it("gives every card of a team a DIFFERENT name, not one repeated", () => {
    const names = ["houston:a1", "houston:a2"].map((p) =>
      missionCardAgentName(byPath, p, "Houston"),
    );
    assert.deepEqual(names, ["Kai", "Marisol"]);
    assert.equal(new Set(names).size, 2);
  });

  it("falls back to the row's name for a path the roster does not hold", () => {
    assert.equal(missionCardAgentName(byPath, "houston:gone", "Ada"), "Ada");
  });

  it("shows nothing at all when neither source knows", () => {
    assert.equal(
      missionCardAgentName(byPath, "houston:gone", undefined),
      undefined,
    );
  });
});

describe("agentsByPath", () => {
  it("keys the roster on the folder path a card carries", () => {
    const byPath = agentsByPath(ROSTER);
    assert.equal(byPath.get("houston:a1")?.name, "Kai");
    assert.equal(byPath.get("nope"), undefined);
  });

  it("is empty for an empty roster", () => {
    assert.equal(agentsByPath([]).size, 0);
  });
});

describe("both board surfaces resolve identity the same way", () => {
  it("takes NAME and COLOUR from the one roster lookup", () => {
    for (const source of [
      read("../src/components/use-mission-control.ts"),
      read("../src/components/board/use-mission-control-archived.ts"),
    ]) {
      assert.match(source, /group: missionCardAgentName\(/);
      assert.match(source, /agentsByFolderPath\.get\(c\.agent_path\)\?\.color/);
      assert.ok(
        !source.includes("group: c.agent_name"),
        "the swept row's name must not be the card's name",
      );
    }
  });
});
