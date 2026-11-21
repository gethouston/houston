import { strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { useUIStore } from "../src/stores/ui.ts";

afterEach(() => useUIStore.getState().reset());

describe("useUIStore.openSettings", () => {
  it("lands on the index from anywhere, even with a section already open", () => {
    const s = useUIStore.getState();
    s.setViewMode("team");
    s.setSettingsSection("shortcuts");

    useUIStore.getState().openSettings(null);

    strictEqual(useUIStore.getState().viewMode, "settings");
    strictEqual(useUIStore.getState().settingsSection, null);
  });

  it("deep-links a section, replacing whatever section was open", () => {
    const s = useUIStore.getState();
    s.setSettingsSection("shortcuts");

    useUIStore.getState().openSettings("reportBug");

    strictEqual(useUIStore.getState().viewMode, "settings");
    strictEqual(useUIStore.getState().settingsSection, "reportBug");
  });

  it("resets the open section on an identity change", () => {
    useUIStore.getState().openSettings("reportBug");

    useUIStore.getState().reset();

    strictEqual(useUIStore.getState().settingsSection, null);
  });
});
