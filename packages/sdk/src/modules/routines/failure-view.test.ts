import type { RoutineAccountFailureCode } from "@houston/protocol";
import { expect, test } from "vitest";
import { routinePauseNotice } from "./auto-pause";
import { failureCodeForReader } from "./failure-view";

const failure = (code: RoutineAccountFailureCode) => ({
  code,
  provider: "anthropic",
});
const signedOut = {
  provider: "anthropic",
  health: "needs_reconnect" as const,
  readerIsCreator: true,
};

test("a not-connected failure on an account the gateway signed out reads as a reconnect", () => {
  expect(
    failureCodeForReader(failure("creator_not_connected"), signedOut),
  ).toBe("creator_needs_reconnect");
  expect(failureCodeForReader(failure("team_not_connected"), signedOut)).toBe(
    "team_needs_reconnect",
  );
});

test("the reader's account speaks only for the same account and provider", () => {
  expect(
    failureCodeForReader(failure("creator_not_connected"), {
      ...signedOut,
      readerIsCreator: false,
    }),
  ).toBe("creator_not_connected");
  expect(
    failureCodeForReader(failure("team_not_connected"), {
      ...signedOut,
      credentialScope: "personal",
    }),
  ).toBe("team_not_connected");
  expect(
    failureCodeForReader(failure("creator_not_connected"), {
      ...signedOut,
      provider: "openai-codex",
    }),
  ).toBe("creator_not_connected");
});

test("an account never connected, or a failure that is not about connecting, keeps its code", () => {
  expect(
    failureCodeForReader(failure("creator_not_connected"), {
      ...signedOut,
      health: "not_connected",
    }),
  ).toBe("creator_not_connected");
  expect(failureCodeForReader(failure("creator_not_connected"))).toBe(
    "creator_not_connected",
  );
  expect(failureCodeForReader(failure("out_of_credits"), signedOut)).toBe(
    "out_of_credits",
  );
});

test("an auto-pause on a signed-out account asks to sign in again", () => {
  const routine = {
    enabled: false,
    auto_paused: {
      reason: "creator_not_connected" as const,
      provider: "anthropic",
      failures: 10,
      at: "2026-10-01T00:00:00.000Z",
    },
  };
  expect(routinePauseNotice(routine)?.remedy).toBe("connect_account");
  expect(routinePauseNotice(routine, signedOut)).toMatchObject({
    remedy: "reconnect_account",
    account: "creator",
  });
});
