import type { RoutineAccountFailureCode } from "@houston/protocol";
import { expect, test } from "vitest";
import { routinePauseNotice } from "./auto-pause";

const at = "2026-09-29T11:00:00.000Z";
const paused = (reason: RoutineAccountFailureCode) => ({
  enabled: false,
  auto_paused: { reason, provider: "anthropic", failures: 10, at },
});

test("every pause reason maps to one fix, naming whose account when it matters", () => {
  const cases: [RoutineAccountFailureCode, string, string | undefined][] = [
    ["creator_not_connected", "connect_account", "creator"],
    ["team_not_connected", "connect_account", "team"],
    ["creator_needs_reconnect", "reconnect_account", "creator"],
    ["team_needs_reconnect", "reconnect_account", "team"],
    ["out_of_credits", "add_credits", undefined],
    ["model_unavailable", "change_model", undefined],
  ];
  for (const [reason, remedy, account] of cases) {
    const notice = routinePauseNotice(paused(reason));
    expect(notice).toMatchObject({
      remedy,
      provider: "anthropic",
      failures: 10,
      pausedAt: at,
    });
    expect(notice && "account" in notice ? notice.account : undefined).toBe(
      account,
    );
  }
});

test("a running routine, a hand pause, or a resumed routine carries no notice", () => {
  expect(routinePauseNotice({ enabled: true })).toBeNull();
  expect(routinePauseNotice({ enabled: false })).toBeNull();
  // A stale reason on an enabled routine never reads as paused.
  expect(
    routinePauseNotice({ ...paused("out_of_credits"), enabled: true }),
  ).toBeNull();
});

test("a routine paused for having no model asks for one, naming no provider", () => {
  expect(
    routinePauseNotice({
      enabled: false,
      auto_paused: {
        reason: "model_unavailable",
        provider: "",
        cause: "no_model",
        failures: 10,
        at,
      },
    }),
  ).toEqual({ remedy: "choose_model", failures: 10, pausedAt: at });
});

test("a reason this client does not know reads as no notice, never a throw", () => {
  const future = {
    enabled: false,
    auto_paused: { reason: "from_the_future", provider: "x", failures: 10, at },
  } as never;
  expect(routinePauseNotice(future)).toBeNull();
});

test("a routine paused for an untyped provider error asks to check its runs, naming the provider", () => {
  const notice = routinePauseNotice({
    enabled: false,
    auto_paused: {
      reason: "model_unavailable",
      provider: "nvidia",
      cause: "provider_error",
      failures: 5,
      at,
    },
  });
  expect(notice).toEqual({
    remedy: "check_runs",
    provider: "nvidia",
    failures: 5,
    pausedAt: at,
  });
});
