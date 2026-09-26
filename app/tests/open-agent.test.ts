import { match, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createStore } from "zustand/vanilla";
import { useAgentSettingsNav } from "../src/components/team-view/agent-settings-nav-store.ts";
import {
  afterRosterSettles,
  onStoreChange,
  type RosterLoadState,
} from "../src/lib/roster-settled.ts";

/**
 * `open-agent.ts` cannot be imported here: its store chain reaches
 * `lib/tauri.ts` → `@houston/engine-adapter` and `lib/i18n.ts`, which are
 * Vite's job, not Node's. So the roster wait it leans on is executed for real,
 * its wiring is pinned against the source, and the copy against the locales.
 */

const OPEN_AGENT = readFileSync(
  new URL("../src/lib/open-agent.ts", import.meta.url),
  "utf8",
);

/** One exported function, up to the next export. */
function fnSource(name: string): string {
  const decl = OPEN_AGENT.indexOf(`export function ${name}(`);
  ok(decl !== -1, `${name} must exist in lib/open-agent.ts`);
  const next = OPEN_AGENT.indexOf("\nexport function ", decl + 1);
  return OPEN_AGENT.slice(decl, next === -1 ? OPEN_AGENT.length : next);
}

describe("employee navigation", () => {
  it("opens employee sections without resolving a folder", () => {
    ok(OPEN_AGENT.includes("openAgentView(dest.agentId, dest.section)"));
    ok(!OPEN_AGENT.includes("currentTeams"));
  });

  it("decides only once the roster has settled", () => {
    for (const name of [
      "openAgentBoard",
      "openAgentSection",
      "openAgentSettings",
    ]) {
      ok(fnSource(name).includes("withSettledAgent("), name);
    }
  });
});

describe("openAgentSettings for an agent the settled roster lacks", () => {
  const body = fnSource("openAgentSettings");
  const failure = body.slice(0, body.indexOf("requestAgentDetail"));

  it("clears any pending one-shot and says why nothing opened", () => {
    ok(failure.includes("clearRequested()"));
    ok(failure.includes("teams:agentNav.settingsUnavailable"));
    ok(failure.includes("teams:agentNav.settingsUnavailableBody"));
    ok(failure.includes('variant: "error"'));
    ok(!failure.includes("openHome()"), "a settings miss never goes home");
  });
});

describe("useAgentSettingsNav.clearRequested", () => {
  it("really drops a pending agent + section request", () => {
    const nav = useAgentSettingsNav.getState();
    nav.requestAgentDetail("agent-1", "skills");
    strictEqual(useAgentSettingsNav.getState().requestedAgentId, "agent-1");
    nav.clearRequested();
    strictEqual(useAgentSettingsNav.getState().requestedAgentId, null);
    strictEqual(useAgentSettingsNav.getState().requestedSection, null);
  });
});

describe("afterRosterSettles", () => {
  it("runs at once on a settled roster", () => {
    const store = createStore<RosterLoadState>(() => ({
      loaded: true,
      loading: false,
    }));
    let runs = 0;
    afterRosterSettles(store, () => runs++);
    strictEqual(runs, 1);
  });

  it("waits out a load in flight, then runs exactly once", () => {
    const store = createStore<RosterLoadState>(() => ({
      loaded: false,
      loading: true,
    }));
    let runs = 0;
    afterRosterSettles(store, () => runs++);
    strictEqual(runs, 0);
    store.setState({ loaded: true, loading: false });
    strictEqual(runs, 1);
    store.setState({ loading: true });
    store.setState({ loading: false });
    strictEqual(runs, 1);
  });
});

describe("afterRosterSettles tripwires", () => {
  const waiting = () =>
    createStore<RosterLoadState>(() => ({ loaded: false, loading: true }));

  it("abandons the wait when a watched slice changes before the roster settles", () => {
    const roster = waiting();
    const nav = createStore(() => ({ navIndex: 0, other: 0 }));
    let runs = 0;
    afterRosterSettles(roster, () => runs++, [
      onStoreChange(nav, (s) => s.navIndex),
    ]);
    nav.setState({ other: 1 });
    nav.setState({ navIndex: 1 });
    roster.setState({ loaded: true, loading: false });
    strictEqual(runs, 0);
  });

  it("still runs when the watched slices hold still", () => {
    const roster = waiting();
    const nav = createStore(() => ({ navIndex: 0, other: 0 }));
    let runs = 0;
    afterRosterSettles(roster, () => runs++, [
      onStoreChange(nav, (s) => s.navIndex),
    ]);
    nav.setState({ other: 1 });
    roster.setState({ loaded: true, loading: false });
    strictEqual(runs, 1);
    nav.setState({ navIndex: 1 });
    strictEqual(runs, 1);
  });
});

describe("a waiting employee nav", () => {
  const wait = OPEN_AGENT.slice(
    OPEN_AGENT.indexOf("function withSettledAgent("),
  );

  it("is abandoned by any navigation, a store reset or a space switch", () => {
    ok(wait.includes("onStoreChange(useUIStore, (s) => s.navStack)"));
    ok(wait.includes("onStoreChange(useUIStore, (s) => s.navIndex)"));
    ok(wait.includes("onStoreChange(useWorkspaceStore, (s) => s.current?.id)"));
  });

  it("hands its follow-up to the opened destination only", () => {
    for (const name of ["openAgentBoard", "openAgentSection"]) {
      const body = fnSource(name);
      ok(
        body.indexOf("opts?.onOpened?.()") > body.indexOf("openDestination("),
        name,
      );
    }
  });

  for (const [file, oneShot] of [
    ["components/command-palette.tsx", "setActivityPanelId"],
    ["hooks/session-notification-navigate.ts", "setActivityPanelId"],
    ["hooks/session-notification-navigate.ts", "setPendingRoutineChat"],
  ] as const) {
    it(`${file} publishes ${oneShot} once the destination opens`, () => {
      const src = readFileSync(
        new URL(`../src/${file}`, import.meta.url),
        "utf8",
      );
      match(src, new RegExp(`onOpened: \\(\\) =>\\s+[\\w.()]*${oneShot}\\(`));
    });
  }

  it("a store reset rebuilds the nav stack", () => {
    const ui = readFileSync(
      new URL("../src/stores/ui.ts", import.meta.url),
      "utf8",
    );
    const reset = ui.slice(ui.indexOf("      reset: () => {"));
    ok(reset.includes("...initialNavState()"));
  });
});

describe("agentNav copy", () => {
  for (const locale of ["en", "es", "pt"] as const) {
    it(`${locale} ships a one-clause title and a body`, () => {
      const teams = JSON.parse(
        readFileSync(
          join(import.meta.dirname, `../src/locales/${locale}/teams.json`),
          "utf8",
        ),
      ) as { agentNav?: Record<string, unknown> };
      const nav = teams.agentNav ?? {};
      for (const key of ["settingsUnavailable", "settingsUnavailableBody"]) {
        strictEqual(typeof nav[key], "string", `${key} must be a string`);
        ok(!(nav[key] as string).includes("—"), `${key}: no em dashes`);
      }
      ok(!(nav.settingsUnavailable as string).trim().endsWith("."));
    });
  }
});
