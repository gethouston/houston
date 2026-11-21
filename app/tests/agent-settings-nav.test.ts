import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston/engine-adapter";
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
  it("orders settings, job description, skills, learnings, then multiplayer access", () => {
    deepStrictEqual(agentSettingsSections(TEAMS), [
      "manage",
      "job-description",
      "skills",
      "learnings",
      "people",
      "integrations",
      "models",
    ]);
    deepStrictEqual(agentSettingsSections(caps()), [
      "manage",
      "job-description",
      "skills",
      "learnings",
    ]);
  });

  it("keeps Settings first, for the managers who are the page's only audience", () => {
    strictEqual(agentSettingsSections(TEAMS).at(0), "manage");
    strictEqual(agentSettingsSections(null).at(0), "manage");
  });

  it("keeps only People on legacy multiplayer", () => {
    deepStrictEqual(agentAccessSections(LEGACY_MULTIPLAYER), ["people"]);
    deepStrictEqual(agentAccessSections(null), []);
  });

  it("hides governance sections in a personal space", () => {
    deepStrictEqual(agentAccessSections(TEAMS, true), []);
    deepStrictEqual(agentSettingsSections(TEAMS, true), [
      "manage",
      "job-description",
      "skills",
      "learnings",
    ]);
  });
});

describe("targetToSection", () => {
  it("maps file targets to context sections", () => {
    strictEqual(targetToSection("instructions"), "job-description");
    strictEqual(targetToSection("learnings"), "learnings");
  });
});

describe("agent settings selection", () => {
  it("opens on Settings when nothing was requested", () => {
    strictEqual(
      resolveAgentSettingsSection(agentSettingsSections(TEAMS), undefined),
      "manage",
    );
    strictEqual(
      resolveAgentSettingsSection(agentSettingsSections(caps()), undefined),
      "manage",
    );
    strictEqual(
      resolveAgentSettingsSection(agentSettingsSections(null), undefined),
      "manage",
    );
  });

  it("keeps visible requests and falls back within their semantic group", () => {
    strictEqual(
      resolveAgentSettingsSection(agentSettingsSections(TEAMS), "integrations"),
      "integrations",
    );
    strictEqual(
      resolveAgentSettingsSection(
        agentSettingsSections(LEGACY_MULTIPLAYER),
        "integrations",
      ),
      "manage",
    );
    strictEqual(
      resolveAgentSettingsSection(agentSettingsSections(caps()), "people"),
      "manage",
    );
  });

  it("retains a hidden deep link until capabilities expose it", () => {
    const waiting = advanceAgentSettingsSelection({
      sections: agentSettingsSections(null),
      pending: "integrations",
      current: "job-description",
    });
    deepStrictEqual(waiting, {
      selected: "manage",
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
