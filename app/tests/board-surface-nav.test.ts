import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pendingMissionSurface,
  surfaceOnActivate,
} from "../src/lib/board-surface-nav.ts";

/**
 * Which of a mission board's two surfaces a published navigation belongs to.
 *
 * The rule that matters most is the one that is invisible until it breaks: the
 * id is classified against the RAW sweep rows, never against either board's
 * filtered items. The active board drops every archived row and the archive
 * keeps only those, so asking either "do you have this mission?" answers "no"
 * for half the missions in the workspace, and the target lands on a board that
 * cannot open it.
 */

const rows = [
  { id: "live", status: "running" },
  { id: "needs", status: "needs_you" },
  { id: "filed", status: "archived" },
];

describe("pendingMissionSurface", () => {
  it("is null when nothing is published", () => {
    assert.equal(pendingMissionSurface(rows, null), null);
  });

  it("sends an archived mission to the ARCHIVE", () => {
    assert.equal(pendingMissionSurface(rows, "filed"), "archived");
  });

  it("sends a live mission to the ACTIVE board", () => {
    assert.equal(pendingMissionSurface(rows, "live"), "active");
    assert.equal(pendingMissionSurface(rows, "needs"), "active");
  });

  it("sends an id the sweep does not know to the ACTIVE board", () => {
    // A mission created a beat ago has no row yet, and the active board is
    // where it belongs (`useJustCreatedMission` holds it there).
    assert.equal(pendingMissionSurface(rows, "just-made"), "active");
  });

  it("sends every target to the ACTIVE board before the sweep answers", () => {
    assert.equal(pendingMissionSurface(undefined, "filed"), "active");
    assert.equal(pendingMissionSurface([], "filed"), "active");
  });

  it("is null with no pending id even when the sweep is missing", () => {
    assert.equal(pendingMissionSurface(undefined, null), null);
  });

  it("treats a row with no status at all as ACTIVE", () => {
    // A warming row (a mission started against a cold engine) carries no
    // status until its real row lands, and it is never archived.
    assert.equal(pendingMissionSurface([{ id: "warm" }], "warm"), "active");
    assert.equal(
      pendingMissionSurface([{ id: "warm", status: null }], "warm"),
      "active",
    );
  });

  it("matches on the id, never on position", () => {
    assert.equal(
      pendingMissionSurface([{ id: "filed", status: "archived" }], "live"),
      "active",
    );
  });
});

describe("surfaceOnActivate", () => {
  it("leaves the archive behind when nothing is published", () => {
    assert.equal(surfaceOnActivate(null), "active");
  });

  it("honours a published navigation naming the archive", () => {
    assert.equal(surfaceOnActivate("archived"), "archived");
  });

  it("stays on the active board when the navigation names it", () => {
    assert.equal(surfaceOnActivate("active"), "active");
  });
});
