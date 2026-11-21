import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  ACTION_BUTTON_CLASS,
  ACTION_ICON_CLASS,
  type CardActionGate,
  showsCardAction,
} from "../src/kanban-card-actions.ts";

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
    assert.equal(archiveOn("done"), true);
  });

  it("never offers archive on a Needs-you card", () => {
    assert.equal(archiveOn("needs_you"), false);
    assert.equal(approveOn("needs_you"), true);
  });

  it("never offers approve on a Done card", () => {
    assert.equal(approveOn("done"), false);
  });

  it("offers NEITHER action on a running card", () => {
    assert.equal(approveOn("running"), false);
    assert.equal(archiveOn("running"), false);
  });

  it("shows at most one status action per card", () => {
    for (const status of ["running", "needs_you", "done", "error", "archived"])
      assert.ok(!(approveOn(status) && archiveOn(status)), status);
  });

  it("stays silent when the consumer wired no handler", () => {
    assert.equal(archiveOn("done", { handled: false }), false);
    assert.equal(approveOn("needs_you", { handled: false }), false);
  });

  it("steps aside for a card that brings its own actions", () => {
    assert.equal(archiveOn("done", { hasCustomActions: true }), false);
    assert.equal(approveOn("needs_you", { hasCustomActions: true }), false);
  });

  it("shows nothing for a status no action claims", () => {
    assert.equal(archiveOn("archived"), false);
    assert.equal(approveOn("archived"), false);
  });

  it("honours a consumer's widened status list", () => {
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
    assert.match(ACTION_BUTTON_CLASS, /\bsize-6\b/);
    assert.match(ACTION_BUTTON_CLASS, /\bitems-center\b/);
    assert.match(ACTION_BUTTON_CLASS, /\bjustify-center\b/);
  });

  it("holds the product's 16px small icon", () => {
    assert.equal(ACTION_ICON_CLASS, "size-4");
  });

  it("rests every action at the same light ink-muted/40", () => {
    assert.match(ACTION_BUTTON_CLASS, /\btext-ink-muted\/40\b/);
    assert.doesNotMatch(ACTION_BUTTON_CLASS, /\btext-ink-muted(?!\/)/);
  });

  it("carries the row's neutral hover, for a semantic one to override", () => {
    assert.match(ACTION_BUTTON_CLASS, /\bhover:text-ink\b/);
    assert.match(ACTION_BUTTON_CLASS, /\bhover:bg-hover\b/);
  });

  it("carries no raw colour value", () => {
    assert.doesNotMatch(ACTION_BUTTON_CLASS, /#|rgb|\[/);
  });
});
