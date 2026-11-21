import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { OrgInviteSummary } from "@houston/engine-adapter";
import {
  classifyInviteError,
  createInviteActionLock,
  inviterDisplayName,
  isExpectedInviteError,
  sortInvites,
  teamIsInSwitcher,
  visibleInvites,
} from "../src/lib/invite-model.ts";

function gatewayError(status: number, error: string, code?: string) {
  return { status, body: code === undefined ? { error } : { error, code } };
}

describe("classifyInviteError", () => {
  it("classifies the shipped flat {error, code} gateway bodies", () => {
    strictEqual(
      classifyInviteError(
        gatewayError(403, "team needs upgrade", "needs_upgrade"),
      ),
      "needs_upgrade",
    );
    strictEqual(
      classifyInviteError(
        gatewayError(
          409,
          "that user is already a member of this organization",
          "already_member",
        ),
      ),
      "already_member",
    );
    strictEqual(
      classifyInviteError(
        gatewayError(404, "invite not found", "invite_not_found"),
      ),
      "invite_not_found",
    );
  });

  it("classifies a bare code and a code-as-error body", () => {
    strictEqual(
      classifyInviteError({ code: "needs_upgrade" }),
      "needs_upgrade",
    );
    strictEqual(
      classifyInviteError({ body: { error: "already_member" } }),
      "already_member",
    );
  });

  it("treats anything else as unknown (keeps the standard bug toast)", () => {
    strictEqual(classifyInviteError(gatewayError(500, "boom")), "unknown");
    strictEqual(classifyInviteError(new Error("network")), "unknown");
    strictEqual(classifyInviteError(null), "unknown");
    strictEqual(classifyInviteError(undefined), "unknown");
  });
});

describe("isExpectedInviteError", () => {
  it("is true for exactly the three explained states", () => {
    strictEqual(
      isExpectedInviteError(
        gatewayError(403, "team needs upgrade", "needs_upgrade"),
      ),
      true,
    );
    strictEqual(
      isExpectedInviteError(
        gatewayError(404, "invite not found", "invite_not_found"),
      ),
      true,
    );
    strictEqual(isExpectedInviteError(gatewayError(500, "boom")), false);
  });
});

describe("inviterDisplayName", () => {
  it("suppresses an opaque handle (the shipped invitedBy is a user id)", () => {
    strictEqual(inviterDisplayName("a1b2c3d4e5f6"), null);
    strictEqual(inviterDisplayName("auth0|9f8e7d"), null);
  });

  it("passes through anything a human can read", () => {
    strictEqual(inviterDisplayName("ana@acme.com"), "ana@acme.com");
    strictEqual(inviterDisplayName("Ana Lima"), "Ana Lima");
  });

  it("treats blank and absent alike", () => {
    strictEqual(inviterDisplayName(undefined), null);
    strictEqual(inviterDisplayName("   "), null);
  });
});

describe("sortInvites", () => {
  const invite = (id: string, orgName: string): OrgInviteSummary => ({
    id,
    orgName,
    role: "user",
  });

  it("orders by team name, then id, without mutating the input", () => {
    const input = [
      invite("b", "Zeta"),
      invite("c", "Acme"),
      invite("a", "Acme"),
    ];
    deepStrictEqual(
      sortInvites(input).map((i) => i.id),
      ["a", "c", "b"],
    );
    deepStrictEqual(
      input.map((i) => i.id),
      ["b", "c", "a"],
    );
  });
});

describe("createInviteActionLock", () => {
  it("lets only the first claim through for one invite", () => {
    const lock = createInviteActionLock();
    strictEqual(lock.claim("inv-1"), true);
    strictEqual(lock.claim("inv-1"), false);
    strictEqual(lock.claim("inv-1"), false);
  });

  it("frees the invite again on release (a failed action is retryable)", () => {
    const lock = createInviteActionLock();
    strictEqual(lock.claim("inv-1"), true);
    lock.release("inv-1");
    strictEqual(lock.claim("inv-1"), true);
  });

  it("locks each invite independently", () => {
    const lock = createInviteActionLock();
    strictEqual(lock.claim("inv-1"), true);
    strictEqual(lock.claim("inv-2"), true);
    strictEqual(lock.claim("inv-1"), false);
    lock.release("inv-1");
    strictEqual(lock.claim("inv-1"), true);
    strictEqual(lock.claim("inv-2"), false);
  });

  it("ignores a release for an invite it never held", () => {
    const lock = createInviteActionLock();
    lock.release("never-claimed");
    strictEqual(lock.claim("never-claimed"), true);
  });
});

describe("visibleInvites", () => {
  const invite = (id: string, orgName: string): OrgInviteSummary => ({
    id,
    orgName,
    role: "user",
  });

  it("renders nothing when the host does not serve spaces", () => {
    deepStrictEqual(visibleInvites(false, [invite("a", "Acme")]), []);
  });

  it("renders nothing before capabilities resolve", () => {
    deepStrictEqual(visibleInvites(false, []), []);
  });

  it("sorts the invites through when spaces are served", () => {
    deepStrictEqual(
      visibleInvites(true, [invite("b", "Zeta"), invite("a", "Acme")]).map(
        (i) => i.id,
      ),
      ["a", "b"],
    );
  });
});

describe("teamIsInSwitcher", () => {
  const ws = (id: string) => ({ id, name: "n" });

  it("is true once the team bridged in as its org:<slug> row", () => {
    strictEqual(
      teamIsInSwitcher(
        [ws("default"), ws("org:0123456789abcdef")],
        "0123456789abcdef",
      ),
      true,
    );
  });

  it("is false when the refresh did not bring the team in", () => {
    strictEqual(teamIsInSwitcher([ws("default")], "0123456789abcdef"), false);
    strictEqual(teamIsInSwitcher([], "0123456789abcdef"), false);
  });

  it("never matches a personal row or a different team", () => {
    strictEqual(
      teamIsInSwitcher([ws("org:fedcba9876543210")], "0123456789abcdef"),
      false,
    );
    strictEqual(
      teamIsInSwitcher([ws("0123456789abcdef")], "0123456789abcdef"),
      false,
    );
  });
});
