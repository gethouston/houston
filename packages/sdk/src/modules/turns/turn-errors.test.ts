import { EngineError, FatalResumeError } from "@houston/runtime-client";
import { describe, expect, it, vi } from "vitest";
import {
  engineVerdictMessage,
  isEngineWakingRejection,
  TURN_FAILED_MESSAGE,
  turnErrorMessage,
} from "./turn-errors";

// HOU-721: raw transport/dev errors ("Load failed", "engine request failed
// (409): {…}" with a non-JSON body, a thrown bug) must never become chat
// copy. Only engine-authored verdicts pass through verbatim.
describe("turnErrorMessage", () => {
  it("passes an engine-authored verdict through verbatim", () => {
    const e = new EngineError(
      409,
      JSON.stringify({ error: "No provider connected. Log in first." }),
    );
    expect(turnErrorMessage(e)).toBe("No provider connected. Log in first.");
  });

  it("unwraps a fatal stream refusal to the engine's verdict", () => {
    const cause = new EngineError(
      401,
      JSON.stringify({ error: "Signed out." }),
    );
    expect(turnErrorMessage(new FatalResumeError(cause))).toBe("Signed out.");
  });

  it("resolves a raw transport error to the product-voice fallback", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(turnErrorMessage(new TypeError("Load failed"))).toBe(
      TURN_FAILED_MESSAGE,
    );
    // The raw cause still reaches the log — friendliness never costs detail.
    expect(spy).toHaveBeenCalledWith(
      "[turn] failed without engine verdict:",
      expect.objectContaining({ message: "Load failed" }),
    );
    spy.mockRestore();
  });

  it("resolves an EngineError with a non-JSON body to the fallback", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(turnErrorMessage(new EngineError(502, "Bad Gateway"))).toBe(
      TURN_FAILED_MESSAGE,
    );
    spy.mockRestore();
  });

  it("never leaks the raw message for non-Error throwables", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(turnErrorMessage("ECONNREFUSED 127.0.0.1:4318")).toBe(
      TURN_FAILED_MESSAGE,
    );
    spy.mockRestore();
  });
});

describe("engineVerdictMessage", () => {
  it("is undefined for anything without an engine JSON body", () => {
    expect(engineVerdictMessage(new TypeError("Load failed"))).toBeUndefined();
    expect(
      engineVerdictMessage(new EngineError(500, "<html>")),
    ).toBeUndefined();
  });
});

// The exact (status, reason) pairs the gateway and host mint for "not here,
// not now". A bare 503 with another reason is a real failure.
describe("isEngineWakingRejection", () => {
  const rejects = (status: number, body: unknown) =>
    isEngineWakingRejection(new EngineError(status, JSON.stringify(body)));

  it("reads the gateway's and the host's waking reasons", () => {
    expect(rejects(503, { error: "engine unavailable" })).toBe(true);
    expect(
      rejects(503, {
        error: "the agent's runtime is still starting, try again shortly",
      }),
    ).toBe(true);
    expect(rejects(502, { error: "engine proxy failed" })).toBe(true);
  });

  // PRODUCT-1777: a draining host (roll, eviction, app quit) refuses the send;
  // the replacement pod takes it.
  it("reads a draining host as a wake, on both shapes it answers", () => {
    expect(
      rejects(503, { error: "the host is shutting down; retry shortly" }),
    ).toBe(true);
    expect(
      rejects(503, {
        error: "engine unavailable",
        detail: "the host is shutting down; retry shortly",
      }),
    ).toBe(true);
  });

  it("never matches a bare status or a neighbouring reason", () => {
    expect(rejects(503, { error: "the host is shutting down" })).toBe(false);
    expect(
      rejects(502, { error: "the host is shutting down; retry shortly" }),
    ).toBe(false);
    expect(isEngineWakingRejection(new TypeError("Load failed"))).toBe(false);
  });
});
