import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  showsUnreadDot,
  UNREAD_DOT_BOX_CLASS,
  UNREAD_DOT_CLASS,
} from "../src/kanban-card-unread.ts";

describe("showsUnreadDot", () => {
  it("paints the mark for an unread card that is not open", () => {
    assert.equal(showsUnreadDot({ unread: true }, false), true);
  });

  it("stays silent while the card is the one open in the panel", () => {
    // The reader is looking at the mission right now; the mark would be
    // announcing what is already on screen (and would flicker between the
    // click and the read cursor moving).
    assert.equal(showsUnreadDot({ unread: true }, true), false);
  });

  it("stays silent for a read card", () => {
    assert.equal(showsUnreadDot({ unread: false }, false), false);
  });

  it("stays silent when the prop is absent", () => {
    // The single-player gate: a board that never computes unread renders
    // exactly what it rendered before this prop existed.
    assert.equal(showsUnreadDot({}, false), false);
    assert.equal(showsUnreadDot({ unread: undefined }, false), false);
  });
});

describe("unread mark tokens", () => {
  it("is the semantic action fill, never a raw colour", () => {
    // Same quiet language as the shell sidebar's UnreadDot: a small filled
    // `bg-action` circle. `bg-action` is near-ink in BOTH themes, so the mark
    // needs no theme branch of its own.
    assert.match(UNREAD_DOT_CLASS, /\bbg-action\b/);
    assert.match(UNREAD_DOT_CLASS, /\brounded-full\b/);
    assert.doesNotMatch(UNREAD_DOT_CLASS, /#|rgb|\[/);
  });

  it("cannot be squeezed by the truncating agent name beside it", () => {
    assert.match(UNREAD_DOT_BOX_CLASS, /\bshrink-0\b/);
  });
});
