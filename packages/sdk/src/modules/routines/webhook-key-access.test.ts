import { describe, expect, it } from "vitest";
import { RoutinesHttpError } from "./http";
import {
  isWebhookKeyNotCreatorRefusal,
  webhookKeyAccess,
} from "./webhook-key-access";

function engineError(status: number, payload: unknown): Error {
  return Object.assign(new Error("engine error"), { status, body: payload });
}

const refusal = {
  error: "only the routine's creator can create or rotate its webhook address",
  code: "not_creator",
};

describe("webhookKeyAccess: the gateway's creator-only mint rule", () => {
  it("a routine naming a creator is that person's alone, whatever the role", () => {
    const base = { createdBy: "u-alice", ownsSpace: true };
    expect(webhookKeyAccess({ ...base, viewerId: "u-alice" })).toBe("allowed");
    expect(webhookKeyAccess({ ...base, viewerId: "u-bob" })).toBe(
      "not_creator",
    );
    expect(
      webhookKeyAccess({
        createdBy: "u-alice",
        viewerId: "u-bob",
        ownsSpace: false,
      }),
    ).toBe("not_creator");
  });

  it("waits for the session before judging a named creator", () => {
    expect(
      webhookKeyAccess({
        createdBy: "u-alice",
        viewerId: null,
        ownsSpace: true,
      }),
    ).toBe("unknown");
    expect(
      webhookKeyAccess({
        createdBy: "u-alice",
        viewerId: undefined,
        ownsSpace: true,
      }),
    ).toBe("unknown");
  });

  it("a routine with no recorded creator is the space owner's", () => {
    expect(
      webhookKeyAccess({
        createdBy: undefined,
        viewerId: "u-bob",
        ownsSpace: true,
      }),
    ).toBe("allowed");
    expect(
      webhookKeyAccess({ createdBy: "", viewerId: "u-bob", ownsSpace: false }),
    ).toBe("not_owner");
    expect(
      webhookKeyAccess({
        createdBy: undefined,
        viewerId: null,
        ownsSpace: undefined,
      }),
    ).toBe("unknown");
  });
});

describe("isWebhookKeyNotCreatorRefusal: the typed 403", () => {
  it("recognizes the refusal however the transport carried it", () => {
    for (const err of [
      engineError(403, refusal),
      engineError(403, JSON.stringify(refusal)),
      new RoutinesHttpError(JSON.stringify(refusal), 403),
    ])
      expect(isWebhookKeyNotCreatorRefusal(err)).toBe(true);
  });

  it("is false for every other failure", () => {
    for (const err of [
      engineError(403, { error: "not assigned", code: "not_assigned" }),
      engineError(404, refusal),
      engineError(403, { error: "forbidden" }),
      new RoutinesHttpError("not json", 403),
      "not_creator",
      undefined,
    ])
      expect(isWebhookKeyNotCreatorRefusal(err)).toBe(false);
  });
});
