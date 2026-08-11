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
    deepStrictEqual(agentSettingsSections(TEAMS, { manager: true }), [
      "job-description",
      "skills",
      "learnings",
      "people",
      "integrations",
      "models",
      "manage",
    ]);
    deepStrictEqual(agentSettingsSections(caps(), { manager: true }), [
      "job-description",
      "skills",
      "learnings",
      "manage",
    ]);
  });

  it("keeps Settings last and hides it from non-managers", () => {
    deepStrictEqual(agentSettingsSections(TEAMS, { manager: false }), [
      "job-description",
      "skills",
      "learnings",
      "people",
      "integrations",
      "models",
    ]);
    strictEqual(
      agentSettingsSections(TEAMS, { manager: true }).at(-1),
      "manage",
    );
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
      resolveAgentSettingsSection(
        agentSettingsSections(TEAMS, { manager: true }),
        "integrations",
      ),
      "integrations",
    );
    // Skills leads the permissions group now, so a hidden access deep link
    // lands there rather than on People.
    strictEqual(
      resolveAgentSettingsSection(
        agentSettingsSections(LEGACY_MULTIPLAYER, { manager: true }),
        "integrations",
      ),
      "skills",
    );
    strictEqual(
      resolveAgentSettingsSection(
        agentSettingsSections(caps(), { manager: true }),
        "people",
      ),
      "skills",
    );
  });

  it("retains a hidden deep link until capabilities expose it", () => {
    const waiting = advanceAgentSettingsSelection({
      sections: agentSettingsSections(null, { manager: true }),
      pending: "integrations",
      current: "job-description",
    });
    deepStrictEqual(waiting, {
      selected: "skills",
      pending: "integrations",
    });
    deepStrictEqual(
      advanceAgentSettingsSelection({
        sections: agentSettingsSections(TEAMS, { manager: true }),
        pending: waiting.pending,
        current: waiting.selected,
      }),
      { selected: "integrations", pending: undefined },
    );
  });
});
