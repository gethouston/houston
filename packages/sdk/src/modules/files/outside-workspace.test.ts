import { describe, expect, it } from "vitest";
import { FilesHttpError } from "./http";
import { isOutsideWorkspaceRefusal } from "./outside-workspace";

/** The adapter's error shape: status plus the parsed (or raw) body. */
function engineError(status: number, payload: unknown): Error {
  return Object.assign(new Error("engine error"), { status, body: payload });
}

const refusal = {
  error: "invalid workspace path: .houston/activity.json",
  code: "outside_workspace",
};

describe("isOutsideWorkspaceRefusal: a files read of a path outside the agent's files", () => {
  it("recognizes the typed 400 however the transport carried it", () => {
    for (const err of [
      engineError(400, refusal),
      engineError(400, JSON.stringify(refusal)),
      new FilesHttpError(JSON.stringify(refusal), 400),
    ])
      expect(isOutsideWorkspaceRefusal(err)).toBe(true);
  });

  it("recognizes the uncoded body an older gateway answers for a sleeping agent", () => {
    const uncoded = { error: refusal.error };
    for (const err of [
      engineError(400, uncoded),
      engineError(400, JSON.stringify(uncoded)),
      new FilesHttpError(JSON.stringify(uncoded), 400),
    ])
      expect(isOutsideWorkspaceRefusal(err)).toBe(true);
  });

  it("never matches on the message alone, an empty path, or another status or code", () => {
    for (const err of [
      engineError(400, { error: "invalid workspace path: " }),
      engineError(400, { error: "invalid workspace path:   " }),
      engineError(400, { error: "missing path" }),
      engineError(404, refusal),
      engineError(404, { error: refusal.error }),
      engineError(400, { ...refusal, code: "read_only" }),
      engineError(400, { error: refusal.error, code: "name_taken" }),
      new FilesHttpError(refusal.error, 400),
      new Error(refusal.error),
      refusal,
      undefined,
    ])
      expect(isOutsideWorkspaceRefusal(err)).toBe(false);
  });
});
