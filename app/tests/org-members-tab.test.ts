import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { OrgMember } from "@houston/engine-adapter";
import {
  canEditMember,
  describeAddResult,
  grantsOwner,
  initialsFor,
  inviterLabel,
  personDisplayName,
  rosterPersonName,
} from "../src/components/organization/people-tab-model.ts";

const member = (over: Partial<OrgMember> & { userId: string }): OrgMember => ({
  role: "user",
  ...over,
});

describe("people tab model — rosterPersonName", () => {
  // A row's aria-labels ("Change role for X", "Remove X") are built from this
  // same helper as its visible line, so the two can never name one person two
  // different ways — the roster showing "Ada Lovelace" while a screen reader
  // announces "ada@x.io" is two people as far as the listener can tell.
  const row = member({
    userId: "u1",
    email: "ada@x.io",
    displayName: "Ada Lovelace",
  });

  it("is the shared display rule, with the row's id as its last resort", () => {
    for (const person of [
      row,
      member({ userId: "u1", email: "ada@x.io" }),
      member({ userId: "u1" }),
    ]) {
      strictEqual(rosterPersonName(person), personDisplayName(person, "u1"));
    }
  });

  it("names a person by the name they set, not their email", () => {
    strictEqual(rosterPersonName(row), "Ada Lovelace");
    strictEqual(
      rosterPersonName(member({ userId: "u1", email: "ada@x.io" })),
      "ada@x.io",
    );
    strictEqual(rosterPersonName(member({ userId: "u1" })), "u1");
  });
});

describe("people tab model — initialsFor", () => {
  it("takes two initials from a dotted email local part", () => {
    strictEqual(initialsFor("ada.lovelace@example.com"), "AL");
  });
  it("splits on -, _, + and whitespace too", () => {
    strictEqual(initialsFor("grace-brewster_murray@navy.mil"), "GB");
  });
  it("uses the first two letters of a single-token name", () => {
    strictEqual(initialsFor("houston"), "HO");
    strictEqual(initialsFor("k@x.io"), "K");
  });
  it("never returns blank", () => {
    strictEqual(initialsFor(""), "?");
  });
});

describe("people tab model — canEditMember", () => {
  it("lets an owner edit a plain member", () => {
    strictEqual(
      canEditMember({ canManage: true, isSelf: false, role: "user" }),
      true,
    );
  });
  it("blocks a non-owner (admin) from editing anyone", () => {
    strictEqual(
      canEditMember({ canManage: false, isSelf: false, role: "user" }),
      false,
    );
  });
  it("blocks editing yourself", () => {
    strictEqual(
      canEditMember({ canManage: true, isSelf: true, role: "user" }),
      false,
    );
  });
  it("lets an owner edit another owner (multi-owner orgs; the gateway guards the last-owner floor)", () => {
    strictEqual(
      canEditMember({ canManage: true, isSelf: false, role: "owner" }),
      true,
    );
  });
});

describe("people tab model — grantsOwner", () => {
  it("granting owner to a non-owner needs the confirm", () => {
    strictEqual(grantsOwner("owner", "user"), true);
    strictEqual(grantsOwner("owner", "admin"), true);
  });
  it("adding/inviting a brand-new person as owner needs the confirm", () => {
    strictEqual(grantsOwner("owner"), true);
  });
  it("a no-op owner-to-owner change does not", () => {
    strictEqual(grantsOwner("owner", "owner"), false);
  });
  it("every non-owner grant applies without a confirm", () => {
    strictEqual(grantsOwner("admin", "user"), false);
    strictEqual(grantsOwner("user", "owner"), false);
    strictEqual(grantsOwner("user"), false);
  });
});

describe("people tab model — describeAddResult", () => {
  it("reports a direct add for a known user", () => {
    deepStrictEqual(
      describeAddResult("ada@x.io", { role: "user", userId: "u9" }),
      {
        kind: "added",
        email: "ada@x.io",
      },
    );
  });
  it("reports an invite (202) and prefers the echoed email", () => {
    deepStrictEqual(
      describeAddResult("typed@x.io", {
        role: "admin",
        invited: true,
        email: "canonical@x.io",
      }),
      { kind: "invited", email: "canonical@x.io" },
    );
  });
  it("falls back to the typed email when the invite echoes none", () => {
    deepStrictEqual(
      describeAddResult("typed@x.io", { role: "user", invited: true }),
      { kind: "invited", email: "typed@x.io" },
    );
  });
});

describe("people tab model — inviterLabel", () => {
  const roster = [
    member({ userId: "owner1", email: "boss@x.io", role: "owner" }),
    member({ userId: "u2", email: "second@x.io" }),
  ];
  it("resolves an inviter still in the roster to their email", () => {
    strictEqual(inviterLabel("owner1", roster), "boss@x.io");
  });
  it("falls back to the raw id for an inviter who has left", () => {
    strictEqual(inviterLabel("ghost", roster), "ghost");
  });
});
