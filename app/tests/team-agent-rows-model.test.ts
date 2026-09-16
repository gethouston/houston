import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston/engine-adapter";
import { agentSettingsSections } from "../src/components/agent-settings/agent-settings-nav.ts";
import {
  readsAgentPolicy,
  visibleAgentRows,
} from "../src/components/team-view/agent-rows-model.ts";

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

const SINGLE_PLAYER = caps();
const LEGACY_MULTIPLAYER = caps({ multiplayer: true, teams: false });
const TEAMS = caps({ multiplayer: true, teams: true });

/**
 * A team's Agents list opens the SAME sections the agent's own settings page
 * rails from, so a row offered in one place can never be missing in the other.
 * What each host actually offers is the thing worth asserting: the ACCESS rows
 * (People, and the two ceilings) are what the capabilities decide.
 */
describe("visibleAgentRows", () => {
  /** The rows every agent has, whatever the host: its own four. */
  const OWN_ROWS = ["manage", "job-description", "skills", "learnings"];

  it("offers no access row at all on a single-player host", () => {
    // There is no roster and no policy to draw, so the block is the agent's
    // own rows — even on a host that advertises `teams` without multiplayer.
    deepStrictEqual(visibleAgentRows(SINGLE_PLAYER), OWN_ROWS);
    deepStrictEqual(visibleAgentRows(caps({ teams: true })), OWN_ROWS);
  });

  it("offers People alone on a multiplayer host without Teams", () => {
    // The roster exists and the caller manages it; the app and model ceilings
    // are stored per agent by a Teams gateway this host does not run.
    deepStrictEqual(visibleAgentRows(LEGACY_MULTIPLAYER), [
      ...OWN_ROWS,
      "people",
    ]);
  });

  it("offers all three access rows on a Teams host", () => {
    deepStrictEqual(visibleAgentRows(TEAMS), [
      ...OWN_ROWS,
      "people",
      "integrations",
      "models",
    ]);
  });

  it("offers none of them in a personal space", () => {
    // A personal space holds exactly one human: nobody to share with, and no
    // ceiling to set over them.
    deepStrictEqual(visibleAgentRows(TEAMS, true), OWN_ROWS);
    deepStrictEqual(visibleAgentRows(LEGACY_MULTIPLAYER, true), OWN_ROWS);
  });

  it("has nothing to show for an unanswered capabilities read", () => {
    deepStrictEqual(visibleAgentRows(null), OWN_ROWS);
    deepStrictEqual(visibleAgentRows(undefined), OWN_ROWS);
  });

  it("stays the agent settings rail itself, for every host", () => {
    // The two doors into one screen: a row this block hides is a section with
    // no way in from the team the agent belongs to.
    for (const c of [SINGLE_PLAYER, LEGACY_MULTIPLAYER, TEAMS]) {
      for (const personal of [false, true]) {
        deepStrictEqual(
          visibleAgentRows(c, personal),
          agentSettingsSections(c, personal),
        );
      }
    }
  });
});

/**
 * The gateway-stored settings read is what fills the two CEILING rows, and only
 * a Teams host answers it, so the roster-wide fan-out fires exactly where those
 * rows are drawn — never on a host with only People, whose value is roster math
 * the screen already holds.
 */
describe("readsAgentPolicy", () => {
  it("reads only where the ceiling rows are shown", () => {
    strictEqual(readsAgentPolicy(TEAMS), true);
    strictEqual(readsAgentPolicy(TEAMS, true), false);
    strictEqual(readsAgentPolicy(LEGACY_MULTIPLAYER), false);
    strictEqual(readsAgentPolicy(SINGLE_PLAYER), false);
    strictEqual(readsAgentPolicy(caps({ teams: true })), false);
    strictEqual(readsAgentPolicy(null), false);
  });
});
