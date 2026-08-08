import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston-ai/engine-client";
import {
  agentAccessSections,
  agentSettingsGroups,
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

describe("agentSettingsGroups — the settings rail", () => {
  it("always opens with the Context group, in order", () => {
    for (const c of [caps(), LEGACY_MULTIPLAYER, TEAMS, null]) {
      const [context] = agentSettingsGroups(c);
      deepStrictEqual(context, {
        id: "context",
        sections: ["job-description", "learnings"],
      });
    }
  });

  it("single player: Permissions is Skills only (no roster, no ceilings)", () => {
    for (const c of [caps(), null, undefined]) {
      deepStrictEqual(agentSettingsGroups(c)[1], {
        id: "permissions",
        sections: ["skills"],
      });
    }
  });

  it("legacy multiplayer without Teams: people, then skills", () => {
    deepStrictEqual(agentSettingsGroups(LEGACY_MULTIPLAYER)[1], {
      id: "permissions",
      sections: ["people", "skills"],
    });
  });

  it("Teams: people, apps, models, then skills", () => {
    deepStrictEqual(agentSettingsGroups(TEAMS)[1], {
      id: "permissions",
      sections: ["people", "integrations", "models", "skills"],
    });
  });

  it("the ceilings need multiplayer, not just teams", () => {
    // `teams` without `multiplayer` is not a shape the gateway serves, but the
    // gate must not widen on it either: no roster, no ceilings.
    deepStrictEqual(agentSettingsGroups(caps({ teams: true }))[1].sections, [
      "skills",
    ]);
  });

  it("never yields an empty group", () => {
    for (const c of [caps(), LEGACY_MULTIPLAYER, TEAMS]) {
      for (const group of agentSettingsGroups(c)) {
        strictEqual(group.sections.length > 0, true);
      }
    }
  });
});

describe("agentAccessSections — the access sections the Admin tab shows", () => {
  it("single-player: none at all (the Admin tab is hidden there)", () => {
    deepStrictEqual(agentAccessSections(caps()), []);
    // A null capabilities host (legacy / pre-Teams) behaves the same.
    deepStrictEqual(agentAccessSections(null), []);
  });

  it("Teams: people, apps, and models", () => {
    deepStrictEqual(agentAccessSections(TEAMS), [
      "people",
      "integrations",
      "models",
    ]);
  });

  it("legacy multiplayer without Teams keeps People only", () => {
    deepStrictEqual(agentAccessSections(LEGACY_MULTIPLAYER), ["people"]);
  });

  it("no Connect section anywhere — even on an apiKeys gateway (HOU-806)", () => {
    for (const c of [
      caps({ apiKeys: true }),
      caps({ multiplayer: true, teams: true, apiKeys: true }),
    ]) {
      strictEqual(agentAccessSections(c).includes("connect" as never), false);
    }
  });
});

describe("agentSettingsSections — flattened rail order", () => {
  it("is Context first, then Permissions", () => {
    deepStrictEqual(agentSettingsSections(agentSettingsGroups(TEAMS)), [
      "job-description",
      "learnings",
      "people",
      "integrations",
      "models",
      "skills",
    ]);
  });
});

describe("targetToSection — deep-link mapping", () => {
  it("maps a turn-summary file target onto its Context section", () => {
    strictEqual(targetToSection("instructions"), "job-description");
    strictEqual(targetToSection("learnings"), "learnings");
  });
});

describe("resolveAgentSettingsSection — deep-link fallback", () => {
  it("keeps a section the rail actually shows", () => {
    strictEqual(
      resolveAgentSettingsSection(agentSettingsGroups(TEAMS), "integrations"),
      "integrations",
    );
  });

  it("falls back INSIDE the requested section's own group", () => {
    // An Apps request is a Permissions intent: landing on the job description
    // would answer a question nobody asked.
    strictEqual(
      resolveAgentSettingsSection(
        agentSettingsGroups(LEGACY_MULTIPLAYER),
        "integrations",
      ),
      "people",
    );
    strictEqual(
      resolveAgentSettingsSection(agentSettingsGroups(caps()), "people"),
      "skills",
    );
    strictEqual(
      resolveAgentSettingsSection(agentSettingsGroups(caps()), "integrations"),
      "skills",
    );
  });

  it("falls back to the first rail item when nothing was requested", () => {
    strictEqual(
      resolveAgentSettingsSection(agentSettingsGroups(TEAMS), undefined),
      "job-description",
    );
  });

  it("falls back to the first rail item when the requested group is empty", () => {
    // A rail with no Context group at all: a Context request has no group of
    // its own to land in, so it takes the rail's first item.
    strictEqual(
      resolveAgentSettingsSection(
        [{ id: "permissions", sections: agentAccessSections(TEAMS) }],
        "learnings",
      ),
      "people",
    );
  });
});

describe("advanceAgentSettingsSelection — a request survives the caps window", () => {
  it("honors a request the rail can show, and retires it", () => {
    deepStrictEqual(
      advanceAgentSettingsSelection({
        groups: agentSettingsGroups(TEAMS),
        pending: "integrations",
        current: "job-description",
      }),
      { selected: "integrations", pending: undefined },
    );
  });

  it("keeps the request pending while `/v1/capabilities` is still null", () => {
    // The pre-caps rail hides Apps, so the request is served a fallback but NOT
    // dropped: it must be re-applied the moment the real rail arrives.
    const window = advanceAgentSettingsSelection({
      groups: agentSettingsGroups(null),
      pending: "integrations",
      current: "job-description",
    });
    deepStrictEqual(window, { selected: "skills", pending: "integrations" });

    deepStrictEqual(
      advanceAgentSettingsSelection({
        groups: agentSettingsGroups(TEAMS),
        pending: window.pending,
        current: window.selected,
      }),
      { selected: "integrations", pending: undefined },
    );
  });

  it("with nothing pending, only re-resolves the section on screen", () => {
    deepStrictEqual(
      advanceAgentSettingsSelection({
        groups: agentSettingsGroups(TEAMS),
        pending: undefined,
        current: "models",
      }),
      { selected: "models", pending: undefined },
    );
    // A caps reload that retires the open section moves within its group.
    deepStrictEqual(
      advanceAgentSettingsSelection({
        groups: agentSettingsGroups(LEGACY_MULTIPLAYER),
        pending: undefined,
        current: "models",
      }),
      { selected: "people", pending: undefined },
    );
  });
});
