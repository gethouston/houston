import { strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { useUIStore } from "../src/stores/ui.ts";

// HOU-788: Usage, Permissions and Admin became Settings sections, so "go to
// Settings" is now two pieces of state (the view AND the open section). They
// move together through one store action, because setting only the view left a
// dead click: with a section open, the sidebar's Settings entry did nothing.

afterEach(() => useUIStore.getState().reset());

describe("useUIStore.openSettings", () => {
  it("lands on the index from anywhere, even with a section already open", () => {
    const s = useUIStore.getState();
    s.setViewMode("team");
    s.setSettingsSection("permissions");

    useUIStore.getState().openSettings(null);

    strictEqual(useUIStore.getState().viewMode, "settings");
    strictEqual(useUIStore.getState().settingsSection, null);
  });

  it("deep-links a section, replacing whatever section was open", () => {
    const s = useUIStore.getState();
    s.setSettingsSection("timeWorked");

    useUIStore.getState().openSettings("organization");

    strictEqual(useUIStore.getState().viewMode, "settings");
    strictEqual(useUIStore.getState().settingsSection, "organization");
  });

  it("resets the open section on an identity change", () => {
    useUIStore.getState().openSettings("organization");

    useUIStore.getState().reset();

    strictEqual(useUIStore.getState().settingsSection, null);
  });
});
