import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  everyReadAnswered,
  offersDeleteForEveryone,
  offersEnableForAll,
  offersKeepOnlyForAgent,
  offersShareToWorkspace,
  withCanonicalHolder,
  workspaceActsState,
} from "../src/components/skills-view/workspace-skill-acts.ts";

/**
 * The editor menu's acts that reach every AI Employee read the skill's
 * WORKSPACE row (every holder), never one employee's narrowed view of it.
 */
const local = (ids: string[]) => ({
  origin: "local" as const,
  agents: ids.map((id) => ({ id })),
});
const store = (ids: string[]) => ({
  origin: "shared" as const,
  agents: ids.map((id) => ({ id })),
});

describe("offersShareToWorkspace", () => {
  it("offers to share per-employee copies where there is a store", () => {
    strictEqual(offersShareToWorkspace(local(["a", "b"]), true), true);
  });

  it("never offers it for a skill the store already holds", () => {
    strictEqual(offersShareToWorkspace(store(["a"]), true), false);
  });

  it("never offers it where the deployment serves no store", () => {
    strictEqual(offersShareToWorkspace(local(["a"]), false), false);
  });
});

describe("offersEnableForAll", () => {
  it("offers it while some employees do not load the store skill", () => {
    strictEqual(offersEnableForAll(store(["a"]), 3, true), true);
  });

  it("stops offering it once every employee loads it", () => {
    strictEqual(offersEnableForAll(store(["a", "b", "c"]), 3, true), false);
  });

  it("never offers it for per-employee copies or without a store", () => {
    strictEqual(offersEnableForAll(local(["a"]), 3, true), false);
    strictEqual(offersEnableForAll(store(["a"]), 3, false), false);
  });
});

describe("offersDeleteForEveryone", () => {
  it("offers it for a store skill", () => {
    strictEqual(offersDeleteForEveryone(store(["a"]), true), true);
  });

  it("offers it for copies on more than one employee", () => {
    strictEqual(offersDeleteForEveryone(local(["a", "b"]), false), true);
  });

  it("leaves a copy one employee alone holds to that section's Delete", () => {
    strictEqual(offersDeleteForEveryone(local(["a"]), false), false);
  });
});

describe("workspaceActsState", () => {
  it("offers nothing until every employee's skills have been read", () => {
    // A row found while other reads are still out names only some holders:
    // "Delete for all" would miss the rest.
    strictEqual(
      workspaceActsState({
        loading: true,
        failed: false,
        complete: false,
        found: true,
      }),
      "checking",
    );
  });

  it("offers nothing when a read failed, and says so", () => {
    strictEqual(
      workspaceActsState({
        loading: false,
        failed: true,
        complete: false,
        found: true,
      }),
      "failed",
    );
  });

  it("offers nothing while an employee's read never answered", () => {
    // An employee the roster lists but the server will not read (gone, or
    // unreadable) is neither loading nor a reported failure, yet the row
    // cannot name what that employee holds.
    strictEqual(
      workspaceActsState({
        loading: false,
        failed: false,
        complete: false,
        found: true,
      }),
      "failed",
    );
  });

  it("offers the acts once every read landed", () => {
    strictEqual(
      workspaceActsState({
        loading: false,
        failed: false,
        complete: true,
        found: true,
      }),
      "ready",
    );
    strictEqual(
      workspaceActsState({
        loading: false,
        failed: false,
        complete: true,
        found: false,
      }),
      "none",
    );
  });
});

describe("withCanonicalHolder", () => {
  it("puts this employee's copy first, so sharing publishes THEIR version", () => {
    const row = { agents: [{ id: "a" }, { id: "b" }, { id: "c" }] };
    deepStrictEqual(
      withCanonicalHolder(row, "b").agents.map((a) => a.id),
      ["b", "a", "c"],
    );
  });

  it("leaves the order alone when the employee is not a holder", () => {
    const row = { agents: [{ id: "a" }] };
    deepStrictEqual(withCanonicalHolder(row, "z").agents, [{ id: "a" }]);
  });
});

describe("everyReadAnswered", () => {
  it("counts a read only while its latest answer stands", () => {
    strictEqual(everyReadAnswered([{ isSuccess: true }]), true);
    strictEqual(everyReadAnswered([]), true);
    // A refetch the server refused keeps the old list in the cache, but that
    // list is no longer what the employee holds.
    strictEqual(
      everyReadAnswered([{ isSuccess: true }, { isSuccess: false }]),
      false,
    );
  });
});

describe("offersKeepOnlyForAgent", () => {
  it("offers it only for an unassigned store skill or this employee alone", () => {
    strictEqual(offersKeepOnlyForAgent(store([]), "a", true), true);
    strictEqual(offersKeepOnlyForAgent(store(["a"]), "a", true), true);
    strictEqual(offersKeepOnlyForAgent(store(["b"]), "a", true), false);
    strictEqual(offersKeepOnlyForAgent(store(["a", "b"]), "a", true), false);
    strictEqual(offersKeepOnlyForAgent(local(["a"]), "a", true), false);
    strictEqual(offersKeepOnlyForAgent(store(["a"]), "a", false), false);
  });
});
