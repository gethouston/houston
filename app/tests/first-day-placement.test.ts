import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  firstDayConfigsSettled,
  firstDayHoldsAutoOpen,
  firstDayPlacement,
  pendingFirstDayAgents,
} from "../src/components/first-day/first-day-model.ts";
import type { Config } from "../src/data/config.ts";

const ana = { folderPath: "/w/ana" };
const bo = { folderPath: "/w/bo" };
const cy = { folderPath: "/w/cy" };

const everyone = () => true;

const configs: Record<string, Config | undefined> = {
  "/w/ana": { firstDay: "pending" },
  "/w/bo": { firstDay: "started" },
  "/w/cy": undefined,
};

describe("pendingFirstDayAgents", () => {
  it("keeps only explicit pending employees, in roster order", () => {
    assert.deepEqual(
      pendingFirstDayAgents([cy, bo, ana], (p) => configs[p], everyone),
      [ana],
    );
  });

  it("offers nothing while configs are still loading", () => {
    assert.deepEqual(
      pendingFirstDayAgents([ana, bo], () => undefined, everyone),
      [],
    );
  });

  it("offers a first day only to someone who may start it", () => {
    const pendingAll = () => ({ firstDay: "pending" }) as const;
    assert.deepEqual(
      pendingFirstDayAgents([ana, cy], pendingAll, (a) => a === cy),
      [cy],
    );
  });
});

describe("firstDayPlacement", () => {
  it("makes the start button the board of a pending employee with no tasks", () => {
    assert.deepEqual(
      firstDayPlacement({
        pinnedAgent: ana,
        pending: [ana],
        pinnedTaskCount: 0,
      }),
      { kind: "hero", agent: ana },
    );
  });

  it("puts the offer above the tasks a pending employee already has", () => {
    assert.deepEqual(
      firstDayPlacement({
        pinnedAgent: ana,
        pending: [ana],
        pinnedTaskCount: 2,
      }),
      { kind: "compact", agent: ana },
    );
  });

  it("offers nothing on the board of an employee whose first day ran", () => {
    assert.deepEqual(
      firstDayPlacement({
        pinnedAgent: bo,
        pending: [ana],
        pinnedTaskCount: 0,
      }),
      { kind: "none" },
    );
  });

  it("names every waiting employee on the team board", () => {
    assert.deepEqual(
      firstDayPlacement({
        pinnedAgent: null,
        pending: [ana, cy],
        pinnedTaskCount: 5,
      }),
      { kind: "banner", agents: [ana, cy] },
    );
  });

  it("shows no banner when nobody on the team waits", () => {
    assert.deepEqual(
      firstDayPlacement({ pinnedAgent: null, pending: [], pinnedTaskCount: 0 }),
      { kind: "none" },
    );
  });
});

describe("firstDayConfigsSettled", () => {
  const ready = { capabilitiesLoading: false, configsPending: false };

  it("settles once capabilities and every config read are in", () => {
    assert.equal(
      firstDayConfigsSettled({ ...ready, anyCreating: false }),
      true,
    );
  });

  it("waits while an employee is still being created: its config read is a placeholder", () => {
    assert.equal(
      firstDayConfigsSettled({ ...ready, anyCreating: true }),
      false,
    );
  });

  it("waits for capabilities, which decide who may start a first day", () => {
    assert.equal(
      firstDayConfigsSettled({
        ...ready,
        capabilitiesLoading: true,
        anyCreating: false,
      }),
      false,
    );
  });
});

describe("firstDayHoldsAutoOpen", () => {
  it("holds the empty board's composer while configs load", () => {
    assert.equal(firstDayHoldsAutoOpen(false, { kind: "none" }), true);
  });

  it("holds it while any start button is on screen", () => {
    assert.equal(
      firstDayHoldsAutoOpen(true, { kind: "hero", agent: ana }),
      true,
    );
    assert.equal(
      firstDayHoldsAutoOpen(true, { kind: "banner", agents: [ana] }),
      true,
    );
  });

  it("releases it once nothing waits", () => {
    assert.equal(firstDayHoldsAutoOpen(true, { kind: "none" }), false);
  });
});
