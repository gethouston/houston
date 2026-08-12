import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston-ai/engine-client";
import {
  agentAccessSections,
  agentSettingsSections,
  targetToSection,
} from "../src/components/agent-settings/agent-settings-nav.ts";
import {
  advanceAgentSettingsSelection,
  resolveAgentSettingsSection,
} from "../src/components/agent-settings/agent-settings-selection.ts";

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: [],
  openaiCompatible: false,
  integrations: [],
  ...over,
});
const TEAMS = caps({ multiplayer: true, teams: true });
const LEGACY_MULTIPLAYER = caps({ multiplayer: true, teams: false });

describe("agentSettingsSections", () => {
  it("orders job description, skills, learnings, then multiplayer access", () => {
    deepStrictEqual(agentSettingsSections(TEAMS), [
      "job-description",
      "skills",
      "learnings",
      "people",
      "integrations",
      "models",
      "manage",
    ]);
    deepStrictEqual(agentSettingsSections(caps()), [
      "job-description",
      "skills",
      "learnings",
      "manage",
    ]);
  });

  it("keeps Settings last, for the managers who are the page's only audience", () => {
    // The page's one door is the agent's own Settings section, drawn for its
    // managers alone, so there is no per-caller gate left in this list.
    strictEqual(agentSettingsSections(TEAMS).at(-1), "manage");
    strictEqual(agentSettingsSections(null).at(-1), "manage");
  });

  it("keeps only People on legacy multiplayer", () => {
    deepStrictEqual(agentAccessSections(LEGACY_MULTIPLAYER), ["people"]);
    deepStrictEqual(agentAccessSections(null), []);
  });
});

describe("targetToSection", () => {
  it("maps file targets to context sections", () => {
    strictEqual(targetToSection("instructions"), "job-description");
    strictEqual(targetToSection("learnings"), "learnings");
  });
});

describe("agent settings selection", () => {
  it("keeps visible requests and falls back within their semantic group", () => {
    strictEqual(
      resolveAgentSettingsSection(agentSettingsSections(TEAMS), "integrations"),
      "integrations",
    );
    // Skills leads the permissions group now, so a hidden access deep link
    // lands there rather than on People.
    strictEqual(
      resolveAgentSettingsSection(
        agentSettingsSections(LEGACY_MULTIPLAYER),
        "integrations",
      ),
      "skills",
    );
    strictEqual(
      resolveAgentSettingsSection(agentSettingsSections(caps()), "people"),
      "skills",
    );
  });

  it("retains a hidden deep link until capabilities expose it", () => {
    const waiting = advanceAgentSettingsSelection({
      sections: agentSettingsSections(null),
      pending: "integrations",
      current: "job-description",
    });
    deepStrictEqual(waiting, {
      selected: "skills",
      pending: "integrations",
    });
    deepStrictEqual(
      advanceAgentSettingsSelection({
        sections: agentSettingsSections(TEAMS),
        pending: waiting.pending,
        current: waiting.selected,
      }),
      { selected: "integrations", pending: undefined },
    );
  });
});
