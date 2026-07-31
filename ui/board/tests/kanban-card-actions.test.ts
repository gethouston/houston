import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  ACTION_BUTTON_CLASS,
  ACTION_ICON_CLASS,
  type CardActionGate,
  showsCardAction,
} from "../src/kanban-card-actions.ts";

/** The card's shipped defaults: approve on Needs you, archive on Done. */
const APPROVE_STATUSES = ["needs_you"];
const ARCHIVE_STATUSES = ["done"];

function gate(overrides: Partial<CardActionGate> = {}): CardActionGate {
  return {
    itemStatus: "needs_you",
    actionStatuses: APPROVE_STATUSES,
    handled: true,
    hasCustomActions: false,
    ...overrides,
  };
}

const approveOn = (itemStatus: string, rest: Partial<CardActionGate> = {}) =>
  showsCardAction(
    gate({ itemStatus, actionStatuses: APPROVE_STATUSES, ...rest }),
  );
const archiveOn = (itemStatus: string, rest: Partial<CardActionGate> = {}) =>
  showsCardAction(
    gate({ itemStatus, actionStatuses: ARCHIVE_STATUSES, ...rest }),
  );

describe("card action render rule", () => {
  it("offers archive on a Done card", () => {
    // The signed-off mission's one remaining move is out of the way, so the
    // box is the Done column's counterpart to the Needs-you checkmark.
    assert.equal(archiveOn("done"), true);
  });

  it("never offers archive on a Needs-you card", () => {
    // Archiving a mission still waiting on the user would hide work before it
    // was dealt with. That card gets the checkmark instead.
    assert.equal(archiveOn("needs_you"), false);
    assert.equal(approveOn("needs_you"), true);
  });

  it("never offers approve on a Done card", () => {
    // The mirror of the rule above: nothing left to sign off.
    assert.equal(approveOn("done"), false);
  });

  it("offers NEITHER action on a running card", () => {
    // A running mission is the engine's, not the user's: there is nothing to
    // sign off yet and nothing to file away. `running` is in neither list.
    assert.equal(approveOn("running"), false);
    assert.equal(archiveOn("running"), false);
  });

  it("shows at most one status action per card", () => {
    // Approve and archive are offered on disjoint statuses, so the action row
    // never has to fit two same-weight glyphs beside rename + delete.
    for (const status of ["running", "needs_you", "done", "error", "archived"])
      assert.ok(!(approveOn(status) && archiveOn(status)), status);
  });

  it("stays silent when the consumer wired no handler", () => {
    // The props are optional: a board that passes no `onArchive` renders
    // exactly what it rendered before the action existed.
    assert.equal(archiveOn("done", { handled: false }), false);
    assert.equal(approveOn("needs_you", { handled: false }), false);
  });

  it("steps aside for a card that brings its own actions", () => {
    // A consumer passing `actions` owns the card's whole action vocabulary;
    // the built-in status buttons must not compete with it.
    assert.equal(archiveOn("done", { hasCustomActions: true }), false);
    assert.equal(approveOn("needs_you", { hasCustomActions: true }), false);
  });

  it("shows nothing for a status no action claims", () => {
    assert.equal(archiveOn("archived"), false);
    assert.equal(approveOn("archived"), false);
  });

  it("honours a consumer's widened status list", () => {
    // The app offers the checkmark on `error` too (it shares the Needs you
    // column). The rule is the prop, never a hardcoded status.
    assert.equal(
      showsCardAction(
        gate({ itemStatus: "error", actionStatuses: ["needs_you", "error"] }),
      ),
      true,
    );
  });
});

describe("card action geometry", () => {
  it("gives every action the same 24px hit box", () => {
    // The accessibility floor for a hit target. Archive shares it with
    // approve / rename / delete, so the row reads as one control cluster.
    assert.match(ACTION_BUTTON_CLASS, /\bsize-6\b/);
    assert.match(ACTION_BUTTON_CLASS, /\bitems-center\b/);
    assert.match(ACTION_BUTTON_CLASS, /\bjustify-center\b/);
  });

  it("holds the product's 16px small icon", () => {
    assert.equal(ACTION_ICON_CLASS, "size-4");
  });

  it("rests every action at the same light ink-muted/40", () => {
    // The four glyphs sit side by side as one cluster, so a per-button resting
    // weight reads as a rendering bug. The tint is deliberately light: the
    // action row is secondary to the mission's own content and recedes until
    // the card is worked with, rising to full strength on hover.
    assert.match(ACTION_BUTTON_CLASS, /\btext-ink-muted\/40\b/);
    assert.doesNotMatch(ACTION_BUTTON_CLASS, /\btext-ink-muted(?!\/)/);
  });

  it("carries the row's neutral hover, for a semantic one to override", () => {
    // Colour appears on hover only. The neutral pair lives in the shared class
    // so archive / rename need no colour of their own; approve and delete
    // append their semantic pair, which tailwind-merge (via `cn`) resolves in
    // the caller's favour — hence both halves must be here to be overridden.
    assert.match(ACTION_BUTTON_CLASS, /\bhover:text-ink\b/);
    assert.match(ACTION_BUTTON_CLASS, /\bhover:bg-hover\b/);
  });

  it("carries no raw colour value", () => {
    // Colour is semantic (tokens) — never a hex, rgb, or arbitrary value.
    assert.doesNotMatch(ACTION_BUTTON_CLASS, /#|rgb|\[/);
  });
});
