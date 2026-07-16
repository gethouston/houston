import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { resolvePanelState } from "../src/panel-state.ts";
import type { KanbanItem } from "../src/types.ts";

const card = (id: string, title = `Mission ${id}`): KanbanItem => ({
  id,
  title,
  status: "running",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("resolvePanelState", () => {
  it("shows the panel with the resolved card for a selected mission", () => {
    const item = card("a1");
    const state = resolvePanelState({
      selectedId: "a1",
      newPanelOpen: false,
      selectedItem: item,
      lastResolved: null,
    });
    assert.equal(state.showPanel, true);
    assert.equal(state.panelItem, item);
  });

  it("keeps the panel open while the selected card is transiently absent", () => {
    // The engine-cold-start window: the selection exists but the card hasn't
    // landed in (or briefly dropped out of) `items`. The panel must not
    // unmount — this was the open-chat close/reopen flicker.
    const state = resolvePanelState({
      selectedId: "a1",
      newPanelOpen: false,
      selectedItem: null,
      lastResolved: null,
    });
    assert.equal(state.showPanel, true);
    assert.equal(state.panelItem, null);
  });

  it("falls back to the same selection's last resolved card", () => {
    const item = card("a1", "Summarize my inbox");
    const state = resolvePanelState({
      selectedId: "a1",
      newPanelOpen: false,
      selectedItem: null,
      lastResolved: { id: "a1", item },
    });
    assert.equal(state.showPanel, true);
    assert.equal(state.panelItem, item);
  });

  it("never leaks another selection's last resolved card", () => {
    const state = resolvePanelState({
      selectedId: "b2",
      newPanelOpen: false,
      selectedItem: null,
      lastResolved: { id: "a1", item: card("a1") },
    });
    assert.equal(state.showPanel, true);
    assert.equal(state.panelItem, null);
  });

  it("prefers the live card over the remembered one", () => {
    const live = card("a1", "Renamed title");
    const state = resolvePanelState({
      selectedId: "a1",
      newPanelOpen: false,
      selectedItem: live,
      lastResolved: { id: "a1", item: card("a1", "Old title") },
    });
    assert.equal(state.panelItem, live);
  });

  it("shows the empty new-mission panel with no card", () => {
    const state = resolvePanelState({
      selectedId: null,
      newPanelOpen: true,
      selectedItem: null,
      lastResolved: { id: "a1", item: card("a1") },
    });
    assert.equal(state.showPanel, true);
    assert.equal(state.panelItem, null);
  });

  it("hides the panel when nothing is selected and no new panel is open", () => {
    const state = resolvePanelState({
      selectedId: null,
      newPanelOpen: false,
      selectedItem: null,
      lastResolved: { id: "a1", item: card("a1") },
    });
    assert.equal(state.showPanel, false);
    assert.equal(state.panelItem, null);
  });
});
