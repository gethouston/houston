import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  classifyWorkspaceDeleteError,
  isExpectedWorkspaceDeleteError,
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
