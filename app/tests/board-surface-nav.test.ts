import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pendingMissionSurface,
  surfaceOnActivate,
} from "../src/lib/board-surface-nav.ts";

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
