import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { handleBoardKeys } from "../src/hooks/board-keys.ts";
import { AGENT_VIEW_ID } from "../src/lib/teams-model.ts";
import { useUIStore } from "../src/stores/ui.ts";

// The file preview is a level of the nav stack: opening pushes, back (the
// phone's hardware back included) closes it, and leaving the place it was
// opened from shuts it.

afterEach(() => useUIStore.getState().reset());

const deck = {
  agentPath: "agent-a",
  filePath: "deck.pptx",
  fileName: "deck.pptx",
  chat: { draftKey: "activity-1" },
};

/** A bare Escape with focus on the page body, as the shell's key router
 *  receives it. Returns whether something claimed the key. */
function pressEscape(): boolean {
  const event = {
    key: "Escape",
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { tagName: "BODY", isContentEditable: false, closest: () => null },
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  handleBoardKeys(event as unknown as KeyboardEvent);
  return event.defaultPrevented;
}

describe("file preview navigation", () => {
  it("opening pushes; back closes it and lands on the chat", () => {
    const s = useUIStore.getState();
    s.openAgentView("agent-a", "mission-control", { nav: "replace" });
    s.setMissionPanelOwner("board", true);
    s.setFilePreview(deck);
    assert.equal(useUIStore.getState().navIndex, 2);

    useUIStore.getState().navBack();
    const now = useUIStore.getState();
    assert.equal(now.filePreview, null);
    assert.equal(now.missionPanelOpen, true);
    assert.equal(now.navIndex, 1);
  });

  it("swapping the file is not a new place; closing retreats", () => {
    const s = useUIStore.getState();
    s.setFilePreview(deck);
    s.setFilePreview({ ...deck, filePath: "b.pdf", fileName: "b.pdf" });
    assert.equal(useUIStore.getState().navIndex, 1);
    assert.equal(useUIStore.getState().filePreview?.filePath, "b.pdf");
    s.setFilePreview(null);
    assert.equal(useUIStore.getState().navIndex, 0);
  });

  it("closes when its chat closes or the user goes elsewhere", () => {
    const s = useUIStore.getState();
    s.setMissionPanelOwner("board", true);
    s.setFilePreview(deck);
    s.setMissionPanelOwner("board", false);
    assert.equal(useUIStore.getState().filePreview, null);

    s.setFilePreview({ ...deck, chat: null });
    s.openSettings(null);
    assert.equal(useUIStore.getState().filePreview, null);
  });

  it("a fresh opening sits beside the chat; swapping files keeps the size", () => {
    const s = useUIStore.getState();
    s.setFilePreview(deck);
    s.togglePreviewExpanded();
    s.setFilePreview({ ...deck, filePath: "b.pdf", fileName: "b.pdf" });
    assert.equal(useUIStore.getState().previewExpanded, true);
    s.setFilePreview(null);
    s.setFilePreview(deck);
    assert.equal(useUIStore.getState().previewExpanded, false);
  });

  it("Esc closes the preview first, then the chat beside it", () => {
    const g = globalThis as { document?: unknown };
    const hadDocument = "document" in g;
    g.document ??= { activeElement: null };
    let chatClosed = 0;
    try {
      const s = useUIStore.getState();
      s.openAgentView("agent-a", "mission-control", { nav: "replace" });
      useUIStore.setState({
        viewMode: AGENT_VIEW_ID,
        onPanelClose: () => {
          chatClosed += 1;
        },
      });
      s.setMissionPanelOwner("board", true);
      s.setFilePreview(deck);

      assert.equal(pressEscape(), true);
      assert.equal(useUIStore.getState().filePreview, null);
      assert.equal(chatClosed, 0);

      assert.equal(pressEscape(), true);
      assert.equal(chatClosed, 1);
    } finally {
      if (!hadDocument) delete g.document;
    }
  });
});
