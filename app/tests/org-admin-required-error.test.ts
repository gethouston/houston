import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isOrgAdminRequiredError } from "../src/lib/org-admin-required-error.ts";

const REASON =
  "only an org owner or admin can connect the organization's AI subscription";

function engineError(status: number, body: unknown): Error {
  const reason = (body as { error?: unknown } | null)?.error;
  const err = new Error(
    typeof reason === "string"
      ? `${reason} (engine error ${status})`
      : `engine error ${status}`,
  ) as Error & { status: number; body: unknown };
  err.name = "HoustonEngineError";
  err.status = status;
  err.body = body;
  return err;
}

function runtimeError(status: number, body: string): Error {
  const err = new Error(
    `engine request failed (${status}): ${body}`,
  ) as Error & {
    status: number;
    body: string;
  };
  err.name = "EngineError";
  err.status = status;
  err.body = body;
  return err;
}

function agentsError(status: number, body: string): Error {
  const err = new Error(body) as Error & { status: number };
  err.name = "AgentsHttpError";
  err.status = status;
  return err;
}

describe("isOrgAdminRequiredError", () => {
  it("matches the api-key connect shape (HoustonEngineError)", () => {
    strictEqual(
      isOrgAdminRequiredError(engineError(403, { error: REASON })),
      true,
    );
  });

  it("matches the OAuth launch shape (runtime-client EngineError)", () => {
    strictEqual(
      isOrgAdminRequiredError(
        runtimeError(403, JSON.stringify({ error: REASON })),
      ),
      true,
    );
  });

  it("matches the SDK write shape (AgentsHttpError)", () => {
    strictEqual(
      isOrgAdminRequiredError(
        agentsError(403, JSON.stringify({ error: REASON })),
      ),
      true,
    );
  });

  it("never matches other 403s", () => {
    strictEqual(
      isOrgAdminRequiredError(engineError(403, { error: "needs_upgrade" })),
      false,
    );
    strictEqual(
      isOrgAdminRequiredError(runtimeError(403, '{"error":"forbidden"}')),
      false,
    );
    strictEqual(isOrgAdminRequiredError(runtimeError(403, "forbidden")), false);
  });

  it("never matches the reason on another status", () => {
    strictEqual(
      isOrgAdminRequiredError(engineError(500, { error: REASON })),
      false,
    );
    strictEqual(
      isOrgAdminRequiredError(
        runtimeError(401, JSON.stringify({ error: REASON })),
      ),
      false,
    );
  });

  it("ignores non-errors and plain errors", () => {
    strictEqual(isOrgAdminRequiredError(null), false);
    strictEqual(isOrgAdminRequiredError(REASON), false);
    strictEqual(isOrgAdminRequiredError(new Error(REASON)), false);
  });
});
