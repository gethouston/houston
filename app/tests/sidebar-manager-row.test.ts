import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ASSISTANT_VIEW_ID } from "../src/components/assistant/id.ts";
import {
  bandSelectedId,
  routeBandSelect,
} from "../src/components/shell/sidebar-manager-selection.ts";
import { managerReachable } from "../src/lib/manager-reachable.ts";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const ROW = read("../src/components/shell/sidebar-manager-row.tsx");
const SIDEBAR = read("../src/components/shell/sidebar.tsx");
const RAIL = read("../src/components/shell/sidebar-rail.tsx");
const HOME_ROW = read("../src/components/agents-home/manager-home-row.tsx");
const REACHABLE_HOOK = read("../src/hooks/use-manager-reachable.ts");

describe("whether the Manager can be reached", () => {
  it("follows discovery once no onboarding runs", () => {
    assert.equal(
      managerReachable({ showAssistant: true, onboardingActive: false }),
      true,
    );
    assert.equal(
      managerReachable({ showAssistant: false, onboardingActive: false }),
      false,
    );
  });

  it("stays reachable while onboarding runs, even where discovery serves none", () => {
    assert.equal(
      managerReachable({ showAssistant: false, onboardingActive: true }),
      true,
    );
  });

  it("is bound to the live gate and the live onboarding in one hook", () => {
    assert.ok(REACHABLE_HOOK.includes("useSurfaceGates()"));
    assert.ok(REACHABLE_HOOK.includes("onboardingActive: onboarding !== null"));
  });
});

describe("the employees band's one selection", () => {
  it("lights the Manager while its view is open, over any agent", () => {
    assert.equal(bandSelectedId(ASSISTANT_VIEW_ID, "ada"), ASSISTANT_VIEW_ID);
    assert.equal(bandSelectedId(ASSISTANT_VIEW_ID, null), ASSISTANT_VIEW_ID);
  });

  it("lights the teams model's agent anywhere else", () => {
    assert.equal(bandSelectedId("team", "ada"), "ada");
    assert.equal(bandSelectedId("settings", null), null);
  });

  it("routes the Manager's row to its view and every other row to the agent", () => {
    const calls: string[] = [];
    const to = {
      openManager: () => calls.push("manager"),
      selectAgent: (id: string) => calls.push(`agent:${id}`),
    };
    routeBandSelect(ASSISTANT_VIEW_ID, to);
    routeBandSelect("ada", to);
    assert.deepEqual(calls, ["manager", "agent:ada"]);
  });
});

describe("the pinned Manager row", () => {
  it("exists only while the Manager is reachable", () => {
    assert.ok(ROW.includes("const reachable = useManagerReachable()"));
    assert.ok(ROW.includes("reachable\n    ? ["));
  });

  it("is named, described and marked like an agent, with its own avatar", () => {
    assert.ok(ROW.includes("id: ASSISTANT_VIEW_ID"));
    assert.ok(ROW.includes('name: t("shell:sidebar.assistant")'));
    assert.ok(ROW.includes('subtitle: t("shell:sidebar.assistantRole")'));
    assert.ok(
      ROW.includes("<ManagerAvatar size={useSidebarAvatarDiameter()} />"),
    );
    assert.ok(ROW.includes('"data-testid": "rail-assistant"'));
  });

  it("opens the assistant view and closes the phone menu on the way", () => {
    assert.ok(ROW.includes("setViewMode(ASSISTANT_VIEW_ID);"));
    assert.ok(ROW.includes("closeMobileMenu();"));
  });

  it("is handed to the rail as its pinned rows and its selection", () => {
    assert.ok(SIDEBAR.includes("pinnedItems: manager.pinnedItems"));
    assert.ok(SIDEBAR.includes("selectedAgentId: manager.selectedId"));
    assert.ok(SIDEBAR.includes("onSelectAgent: manager.onSelect"));
    assert.ok(RAIL.includes("pinnedItems={model.pinnedItems}"));
  });
});

describe("the phone roster's Manager row", () => {
  it("fits the avatar's halo inside the employees' avatar diameter", () => {
    assert.ok(
      HOME_ROW.includes(
        "<ManagerAvatar size={managerAvatarSizeWithin(FRONT_DIAMETER)} />",
      ),
    );
  });

  it("exists only while the Manager is reachable, like the rail's", () => {
    assert.ok(HOME_ROW.includes("const reachable = useManagerReachable()"));
    assert.ok(HOME_ROW.includes("if (!reachable) return null;"));
  });

  it("pushes the assistant view, so its back chevron returns here", () => {
    assert.ok(
      HOME_ROW.includes('setViewMode(ASSISTANT_VIEW_ID, { nav: "push" })'),
    );
  });
});
