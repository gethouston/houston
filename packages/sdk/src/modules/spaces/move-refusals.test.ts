import { describe, expect, it } from "vitest";
import {
  canRetryMoveError,
  classifyMoveError,
  classifyMoveRePost,
  isMoveAlreadyDone,
  isMoveRefusalCode,
  isMoveRefusedBeforeStart,
} from "./move-refusals";

describe("classifyMoveError", () => {
  it.each([
    "unsupported_move",
    "unmovable_volume",
    "needs_upgrade",
    "name_taken",
  ] as const)("passes the C8 refusal %s through", (code) => {
    expect(classifyMoveError(code)).toBe(code);
    expect(isMoveRefusalCode(code)).toBe(true);
  });

  it("maps anything else to unknown", () => {
    for (const code of ["weird", "timeout", undefined, null]) {
      expect(classifyMoveError(code)).toBe("unknown");
      expect(isMoveRefusalCode(code)).toBe(false);
    }
  });
});

describe("which move failures a retry can fix", () => {
  it.each(["unsupported_move", "needs_upgrade", "timeout", "unknown"] as const)(
    "%s allows a retry",
    (kind) => {
      expect(canRetryMoveError(kind)).toBe(true);
    },
  );

  it("a storage the gateway cannot move is terminal", () => {
    expect(canRetryMoveError("unmovable_volume")).toBe(false);
  });

  it("a name the team already holds needs a rename, not a retry", () => {
    expect(canRetryMoveError("name_taken")).toBe(false);
  });
});

describe("a move refused before anything started", () => {
  it("is name_taken alone: no lock is held, so nothing is left to resume", () => {
    expect(isMoveRefusedBeforeStart("name_taken")).toBe(true);
    for (const code of [
      "unsupported_move",
      "unmovable_volume",
      "needs_upgrade",
      "move_in_progress",
      undefined,
    ]) {
      expect(isMoveRefusedBeforeStart(code)).toBe(false);
    }
  });
});

describe("a move the agent already finished", () => {
  it("is agent_moved: the agent lives in the target, so the move is done", () => {
    expect(isMoveAlreadyDone("agent_moved")).toBe(true);
  });

  it("is nothing else, including a plain or coded not-found", () => {
    for (const code of [
      "agent_not_found",
      "agent not found",
      "move_in_progress",
      "name_taken",
      undefined,
      null,
    ]) {
      expect(isMoveAlreadyDone(code)).toBe(false);
    }
  });

  it("is not a refusal: it never classifies as a failure kind", () => {
    expect(isMoveRefusalCode("agent_moved")).toBe(false);
  });
});

describe("what a client does with the answer to a move it re-sends", () => {
  it("agent_moved is done: the agent already lives in the team", () => {
    expect(classifyMoveRePost("agent_moved")).toEqual({ kind: "done" });
  });

  it("a coded agent_not_found is gone: nothing is left to move or resume", () => {
    expect(classifyMoveRePost("agent_not_found")).toEqual({ kind: "gone" });
  });

  it("name_taken is refused before anything started", () => {
    expect(classifyMoveRePost("name_taken")).toEqual({
      kind: "refused",
      code: "name_taken",
    });
  });

  it("move_in_progress is another driver's live move", () => {
    expect(classifyMoveRePost("move_in_progress")).toEqual({
      kind: "inProgress",
    });
  });

  it("keeps everything else, an older gateway's uncoded 404 included", () => {
    for (const code of [
      "agent not found",
      "agent_not_ready",
      "needs_upgrade",
      "not_member",
      undefined,
    ]) {
      expect(classifyMoveRePost(code)).toEqual({ kind: "rejected", code });
    }
  });
});
