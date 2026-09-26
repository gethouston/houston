import { describe, expect, it } from "vitest";
import { PlanHttpError } from "./index";
import { plusCheckoutRefusal } from "./refusals";

function adapterError(status: number, body: unknown): Error {
  return Object.assign(new Error(`engine request failed (${status})`), {
    status,
    body,
  });
}

describe("a Plus checkout refusal is an expected state", () => {
  it.each([
    [409, "already_plus"],
    [410, "account_deleted"],
    [503, "not_configured"],
  ] as const)("recognizes %i %s from the adapter's parsed body", (status, code) => {
    expect(
      plusCheckoutRefusal(adapterError(status, { error: "refused", code })),
    ).toBe(code);
  });

  it("recognizes the SDK's own error carrying the body as its message", () => {
    const error = new PlanHttpError(
      JSON.stringify({ error: "already on plus", code: "already_plus" }),
      409,
    );
    expect(plusCheckoutRefusal(error)).toBe("already_plus");
  });

  it("ignores a code arriving with a status the contract never pairs it with", () => {
    expect(
      plusCheckoutRefusal(adapterError(500, { code: "already_plus" })),
    ).toBeNull();
    expect(
      plusCheckoutRefusal(adapterError(503, { error: "engine unavailable" })),
    ).toBeNull();
  });

  it("ignores anything that is not an HTTP refusal", () => {
    expect(plusCheckoutRefusal(new Error("boom"))).toBeNull();
    expect(plusCheckoutRefusal("already_plus")).toBeNull();
    expect(plusCheckoutRefusal(adapterError(409, "not json"))).toBeNull();
  });
});
