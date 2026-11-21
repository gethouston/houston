import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { panelWideCapable } from "../src/components/shell/detail-panel-owners.ts";
import { useUIStore } from "../src/stores/ui.ts";

afterEach(() => {
  useUIStore.getState().closeMissionPanel();
  useUIStore.getState().setChatWide(false);
  useUIStore.getState().reset();
});

const panelWide = () => {
  const s = useUIStore.getState();
  return (
    s.missionPanelOpen && s.chatWide && panelWideCapable(s.missionPanelOwners)
  );
};

describe("chatWide", () => {
  it("starts in the side layout and toggles", () => {
    assert.equal(useUIStore.getState().chatWide, false);
    useUIStore.getState().toggleChatWide();
    assert.equal(useUIStore.getState().chatWide, true);
    useUIStore.getState().toggleChatWide();
    assert.equal(useUIStore.getState().chatWide, false);
  });

  it("goes wide only while an opted-in surface holds the panel", () => {
    const s = useUIStore.getState();
    s.setChatWide(true);
    assert.equal(panelWide(), false);

    s.setMissionPanelOwner("skill-setup", true);
    assert.equal(useUIStore.getState().missionPanelOpen, true);
    assert.equal(panelWide(), false);

    s.setMissionPanelOwner("board", true, true);
    assert.equal(panelWide(), true);

    s.setMissionPanelOwner("board", false);
    assert.equal(panelWide(), false);
  });

  it("the preference outlives the panel and follows the next chat", () => {
    const s = useUIStore.getState();
    s.setChatWide(true);
    s.setMissionPanelOwner("board", true, true);
    assert.equal(panelWide(), true);
    s.setMissionPanelOwner("board", false);
    assert.equal(useUIStore.getState().chatWide, true);
    s.setMissionPanelOwner("archived", true, true);
    assert.equal(panelWide(), true);
  });

  it("a second claim on an open panel is not a navigation (unchanged by consent)", () => {
    const s = useUIStore.getState();
    const before = s.navIndex;
    s.setMissionPanelOwner("routines", true);
    assert.equal(useUIStore.getState().navIndex, before + 1);
    s.setMissionPanelOwner("board", true, true);
    assert.equal(useUIStore.getState().navIndex, before + 1);
  });
});
