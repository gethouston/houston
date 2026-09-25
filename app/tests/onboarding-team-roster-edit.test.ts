import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  rosterEdit,
  rosterNameCommit,
  rosterRevert,
  rosterSaved,
  rosterUnsaved,
} from "../src/components/onboarding/team/team-roster-edit.ts";
import {
  type RosterMember,
  rosterJoin,
  rosterRetry,
  rosterSettle,
} from "../src/components/onboarding/team/team-roster-model.ts";

const brief = { context: "Bakery", role: "Executive assistant" };
const joined = () =>
  rosterJoin([], { key: "hire-1", name: "Pax", color: "navy", brief });
const hired = (name = "Pax") =>
  rosterSettle(joined(), "hire-1", { kind: "hired", id: "pax", name });
const only = (members: readonly RosterMember[]) => members[0];

describe("editing a hire while it joins", () => {
  it("shows the edit at once and keeps it when the create lands", () => {
    const edited = rosterEdit(joined(), "hire-1", {
      name: "Olivia",
      color: "forest",
    });
    strictEqual(only(edited).name, "Olivia");
    const landed = only(
      rosterSettle(edited, "hire-1", { kind: "hired", id: "pax", name: "Pax" }),
    );
    strictEqual(landed.name, "Olivia");
    // The host holds what it created; the edit is still to save.
    deepStrictEqual(landed.saved, { name: "Pax", color: "navy", brief });
    deepStrictEqual(rosterUnsaved(landed), { name: "Olivia", color: "forest" });
  });

  it("takes the host's tidied name when nobody renamed it", () => {
    const landed = only(hired("Pax 2"));
    strictEqual(landed.name, "Pax 2");
    strictEqual(rosterUnsaved(landed), null);
  });

  it("carries an edit made after a failure into the retry", () => {
    const failed = rosterSettle(joined(), "hire-1", {
      kind: "failed",
      reason: "failed",
    });
    const edited = rosterEdit(failed, "hire-1", { name: "Olivia" });
    // Nothing to save while it does not exist.
    strictEqual(rosterUnsaved(only(edited)), null);
    const retried = rosterRetry(edited, "hire-1", []);
    strictEqual(retried?.retried.name, "Olivia");
    deepStrictEqual(retried?.retried.saved, {
      name: "Olivia",
      color: "navy",
      brief,
    });
  });
});

describe("editing a hire on the team", () => {
  it("never touches another member", () => {
    const two = rosterJoin(hired(), {
      key: "hire-2",
      name: "Quill",
      color: "navy",
      brief,
    });
    const edited = rosterEdit(two, "hire-1", { color: "crimson" });
    strictEqual(edited[0].color, "crimson");
    deepStrictEqual(edited[1], two[1]);
  });

  it("adopts where a save landed: a rename moves the id", () => {
    const edited = rosterEdit(hired(), "hire-1", { name: "Olivia" });
    const sent = rosterUnsaved(only(edited)) ?? {};
    const saved = only(
      rosterSaved(edited, "hire-1", sent, { id: "olivia", name: "Olivia" }),
    );
    deepStrictEqual(saved.status, { kind: "hired", id: "olivia" });
    deepStrictEqual(saved.saved, { name: "Olivia", color: "navy", brief });
    strictEqual(rosterUnsaved(saved), null);
  });

  it("keeps a newer edit made while a save ran, for the next save", () => {
    const edited = rosterEdit(hired(), "hire-1", { name: "Olivia" });
    const sent = rosterUnsaved(only(edited)) ?? {};
    const newer = rosterEdit(edited, "hire-1", { name: "Liv" });
    const saved = only(
      rosterSaved(newer, "hire-1", sent, { id: "olivia", name: "Olivia" }),
    );
    strictEqual(saved.name, "Liv");
    deepStrictEqual(rosterUnsaved(saved), { name: "Liv" });
  });

  it("puts back what the host holds when a save fails", () => {
    const edited = rosterEdit(hired(), "hire-1", {
      name: "Olivia",
      color: "forest",
    });
    const sent = rosterUnsaved(only(edited)) ?? {};
    const reverted = only(rosterRevert(edited, "hire-1", sent));
    strictEqual(reverted.name, "Pax");
    strictEqual(reverted.color, "navy");
  });
});

describe("committing a name typed on a roster card", () => {
  const member = only(hired());

  it("takes a typed name, tidied", () => {
    deepStrictEqual(rosterNameCommit("  Olivia ", member, ["Pax"]), {
      kind: "name",
      name: "Olivia",
    });
  });

  it("refuses a blank name: every AI Employee needs one", () => {
    deepStrictEqual(rosterNameCommit("  ", member, ["Pax"]), {
      kind: "issue",
      issue: "required",
    });
  });

  it("never counts the member's own name as a clash", () => {
    deepStrictEqual(rosterNameCommit("pax", member, ["Pax"]), {
      kind: "name",
      name: "pax",
    });
  });

  it("refuses a name another AI Employee holds", () => {
    deepStrictEqual(rosterNameCommit("Quill", member, ["Pax", "quill"]), {
      kind: "issue",
      issue: "taken",
    });
  });
});
