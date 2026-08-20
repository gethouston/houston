import assert from "node:assert";
import { describe, it } from "node:test";
import type { Workspace } from "../src/lib/types.ts";
import {
  planSpacesRefresh,
  withoutPendingDeletes,
} from "../src/lib/workspace-refresh.ts";

// The live-spaces poll (HOU: "a new org must appear without relaunching").
// planSpacesRefresh is the pure merge decision the workspace store applies on
// every background re-list; these pin its three outcomes.

const ws = (id: string, name: string, isDefault = false): Workspace => ({
  id,
  name,
  isDefault,
  createdAt: "2026-07-31T00:00:00Z",
});

const personal = ws("Houston", "Personal", true);
const teamA = ws("org:aaaaaaaaaaaaaaaa", "Marketing");
const teamB = ws("org:bbbbbbbbbbbbbbbb", "Sales");

describe("planSpacesRefresh", () => {
  it("is unchanged when the list and names match (the common tick)", () => {
    const plan = planSpacesRefresh([personal, teamA], personal, [
      personal,
      teamA,
    ]);
    assert.strictEqual(plan.kind, "unchanged");
  });

  it("updates in place when a new team appears, keeping the selection", () => {
    const plan = planSpacesRefresh([personal], personal, [personal, teamA]);
    assert.strictEqual(plan.kind, "update");
    assert.deepStrictEqual(
      plan.kind === "update" && plan.workspaces.map((w) => w.id),
      [personal.id, teamA.id],
    );
    assert.strictEqual(plan.kind === "update" && plan.current?.id, personal.id);
  });

  it("adopts the fresh current object on a server-side rename", () => {
    const renamed = { ...teamA, name: "Marketing LATAM" };
    const plan = planSpacesRefresh([personal, teamA], teamA, [
      personal,
      renamed,
    ]);
    assert.strictEqual(plan.kind, "update");
    assert.strictEqual(
      plan.kind === "update" && plan.current?.name,
      "Marketing LATAM",
    );
  });

  it("reselects the default space when the active one vanished", () => {
    const plan = planSpacesRefresh([personal, teamA, teamB], teamA, [
      personal,
      teamB,
    ]);
    assert.strictEqual(plan.kind, "reselect");
    assert.strictEqual(
      plan.kind === "reselect" && plan.current?.id,
      personal.id,
    );
  });

  it("keeps a null selection null while still updating the list", () => {
    const plan = planSpacesRefresh([], null, [personal]);
    assert.strictEqual(plan.kind, "update");
    assert.strictEqual(plan.kind === "update" && plan.current, null);
  });

  it("treats a pure removal of a non-active space as an update", () => {
    const plan = planSpacesRefresh([personal, teamA, teamB], personal, [
      personal,
      teamA,
    ]);
    assert.strictEqual(plan.kind, "update");
    assert.strictEqual(plan.kind === "update" && plan.current?.id, personal.id);
  });
});

// PRODUCT-1426: while an optimistic delete is in flight the server still lists
// the space, so every re-list must drop pending-delete rows or the 60s poll /
// a window focus would resurrect a space the user just watched disappear.
describe("withoutPendingDeletes", () => {
  it("returns the same array when nothing is pending (the common tick)", () => {
    const fresh = [personal, teamA];
    assert.strictEqual(withoutPendingDeletes(fresh, new Set()), fresh);
  });

  it("drops rows whose delete is still in flight", () => {
    assert.deepStrictEqual(
      withoutPendingDeletes([personal, teamA, teamB], new Set([teamA.id])),
      [personal, teamB],
    );
  });

  it("composes with planSpacesRefresh into an unchanged tick mid-delete", () => {
    const plan = planSpacesRefresh(
      [personal, teamB],
      personal,
      withoutPendingDeletes([personal, teamA, teamB], new Set([teamA.id])),
    );
    assert.strictEqual(plan.kind, "unchanged");
  });
});
