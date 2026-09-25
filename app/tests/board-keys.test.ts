import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { handleBoardKeys } from "../src/hooks/board-keys.ts";
import { TEAM_VIEW_ID } from "../src/lib/teams-model.ts";
import { useUIStore } from "../src/stores/ui.ts";

// The board owns BARE keys (Enter opens the highlighted card, arrows move the
// highlight), even with focus left on the rail row or tab that led there. A
// dialog or popover open over the board answers every key it is sent, so the
// board hands those keys back.

/** A DOM node reduced to what the router reads: its tag and the simple
 *  selectors it and each ancestor match, innermost first. */
function node(chain: string[][], tagName = "DIV") {
  return {
    tagName,
    isContentEditable: false,
    closest(selector: string) {
      const wanted = selector.split(",").map((part) => part.trim());
      return chain.some((matches) => matches.some((m) => wanted.includes(m)))
        ? {}
        : null;
    },
  };
}

function press(key: string, target: ReturnType<typeof node>) {
  const event = {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };
  handleBoardKeys(event as unknown as KeyboardEvent);
  return event.defaultPrevented;
}

const BODY = node([], "BODY");
const DIALOG = '[role="dialog"]';
const POPPER = "[data-radix-popper-content-wrapper]";

let opened = 0;
let moved = 0;

beforeEach(() => {
  opened = 0;
  moved = 0;
  useUIStore.setState({
    viewMode: TEAM_VIEW_ID,
    teamSection: null,
    onBoardOpen: () => {
      opened += 1;
    },
    onBoardNavigate: () => {
      moved += 1;
    },
  });
});

afterEach(() => useUIStore.getState().reset());

describe("board keys", () => {
  it("Enter with nothing focused opens the highlighted card", () => {
    assert.equal(press("Enter", BODY), true);
    assert.equal(opened, 1);
  });

  it("an arrow with nothing focused moves the highlight", () => {
    assert.equal(press("ArrowDown", BODY), true);
    assert.equal(moved, 1);
  });

  it("Enter from the tab that led to the board opens the highlighted card", () => {
    assert.equal(press("Enter", node([["button"]], "BUTTON")), true);
    assert.equal(opened, 1);
  });

  it("Enter inside a dialog over the board stays the dialog's", () => {
    const suggest = node([["button"], [DIALOG]], "BUTTON");
    assert.equal(press("Enter", suggest), false);
    assert.equal(opened, 0);
  });

  it("an arrow inside a popover over the board stays the popover's", () => {
    const swatch = node([['[role="radio"]'], [POPPER]]);
    assert.equal(press("ArrowDown", swatch), false);
    assert.equal(moved, 0);
  });
});
