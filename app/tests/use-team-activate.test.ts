import { deepStrictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { useTeamActivate } from "../src/components/shell/use-team-activate.ts";

describe("folder header activation", () => {
  it("toggles the folder's stored disclosure without selecting a screen", () => {
    const toggled: string[] = [];
    const handlers = useTeamActivate({
      teams: [{ id: "design", name: "Design", agents: [] }],
      sidebar: { toggleGroupCollapsed: (id) => toggled.push(id) },
    });
    handlers.onActivateGroup("design");
    handlers.onActivateGroup("design");
    deepStrictEqual(toggled, ["design", "design"]);
  });

  it("ignores a folder removed before the click arrives", () => {
    const toggled: string[] = [];
    useTeamActivate({
      teams: [],
      sidebar: { toggleGroupCollapsed: (id) => toggled.push(id) },
    }).onActivateGroup("gone");
    deepStrictEqual(toggled, []);
  });
});
