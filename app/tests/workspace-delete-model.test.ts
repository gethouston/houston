import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Workspace } from "../src/lib/types.ts";
import {
  classifyWorkspaceDeleteError,
  isExpectedWorkspaceDeleteError,
  restoreSpaceRow,
} from "../src/lib/workspace-delete-model.ts";

/**
 * PRODUCT-1410: the Danger Zone's error taxonomy for `DELETE /v1/orgs/:slug`,
 * written against the gateway's flat `{error, code}` body thrown as a
 * `HoustonEngineError`-shaped object — the only shape production produces.
 */
function gatewayError(status: number, error: string, code?: string) {
  return { status, body: code === undefined ? { error } : { error, code } };
}

describe("classifyWorkspaceDeleteError", () => {
  it("classifies the gateway's expected business rejections", () => {
    strictEqual(
      classifyWorkspaceDeleteError(
        gatewayError(409, "members remain", "has_members"),
      ),
      "has_members",
    );
    strictEqual(
      classifyWorkspaceDeleteError(
        gatewayError(409, "subscription active", "subscription_active"),
      ),
      "subscription_active",
    );
    strictEqual(
      classifyWorkspaceDeleteError(
        gatewayError(403, "personal space", "personal_space"),
      ),
      "personal_space",
    );
  });

  it("sends everything else to the standard red toast (unknown)", () => {
    strictEqual(
      classifyWorkspaceDeleteError(gatewayError(403, "not allowed")),
      "unknown",
    );
    strictEqual(
      classifyWorkspaceDeleteError(
        gatewayError(404, "org not found", "org_not_found"),
      ),
      "unknown",
    );
    strictEqual(classifyWorkspaceDeleteError(new Error("boom")), "unknown");
    strictEqual(classifyWorkspaceDeleteError(undefined), "unknown");
  });
});

// PRODUCT-1426: the optimistic delete's rollback puts the row back where the
// user last saw it when the gateway rejects the delete.
const ws = (id: string, name: string, isDefault = false): Workspace => ({
  id,
  name,
  isDefault,
  createdAt: "2026-08-19T00:00:00Z",
});

const personal = ws("Houston", "Personal", true);
const teamA = ws("org:aaaaaaaaaaaaaaaa", "Marketing");
const teamB = ws("org:bbbbbbbbbbbbbbbb", "Sales");

describe("restoreSpaceRow", () => {
  it("puts the row back at its old index", () => {
    deepStrictEqual(restoreSpaceRow([personal, teamB], teamA, 1), [
      personal,
      teamA,
      teamB,
    ]);
  });

  it("clamps an out-of-range index (the list shrank meanwhile)", () => {
    deepStrictEqual(restoreSpaceRow([personal], teamB, 2), [personal, teamB]);
  });

  it("lets a racing re-list win: an already-present id changes nothing", () => {
    const renamed = { ...teamA, name: "Marketing LATAM" };
    const list = [personal, renamed];
    strictEqual(restoreSpaceRow(list, teamA, 1), list);
  });
});

describe("isExpectedWorkspaceDeleteError", () => {
  it("is true exactly for the classified codes", () => {
    strictEqual(
      isExpectedWorkspaceDeleteError(
        gatewayError(409, "members remain", "has_members"),
      ),
      true,
    );
    strictEqual(
      isExpectedWorkspaceDeleteError(gatewayError(500, "boom")),
      false,
    );
  });
});
