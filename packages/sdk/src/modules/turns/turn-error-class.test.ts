import { expect, test } from "vitest";
import {
  isSessionStatusOrigin,
  isTurnErrorClass,
  providerErrorClass,
  turnErrorDisposition,
} from "./turn-error-class";

test("names every class and refuses anything else", () => {
  for (const cls of [
    "stopped",
    "engine_restart",
    "send_busy",
    "compute_busy",
    "turn_died",
    "send_lost",
    "stream_lost",
    "agent_too_large",
    "agent_setup_failed",
    "turn_unconfirmed",
    "unexplained",
    "engine_verdict",
    "provider_rate_limited",
    providerErrorClass("plan_message_limit"),
    providerErrorClass("usage_limit_paused"),
  ])
    expect(isTurnErrorClass(cls), cls).toBe(true);
  for (const value of ["provider_", "provider_nope", "unknown", "", 3, null])
    expect(isTurnErrorClass(value), String(value)).toBe(false);
  expect(isSessionStatusOrigin("sent")).toBe(true);
  expect(isSessionStatusOrigin("observed")).toBe(true);
  expect(isSessionStatusOrigin("foreground")).toBe(false);
});

test("disposes each class once, for every surface", () => {
  expect(turnErrorDisposition("stopped")).toBe("intended");
  for (const cls of [
    "engine_restart",
    "send_busy",
    "compute_busy",
    "provider_unauthenticated",
    "provider_rate_limited",
    "provider_plan_message_limit",
    "provider_provider_internal",
    "provider_malformed_response",
    "provider_usage_limit_paused",
  ] as const)
    expect(turnErrorDisposition(cls), cls).toBe("handled");
  for (const cls of [
    "provider_unknown",
    "turn_died",
    "send_lost",
    "stream_lost",
    "agent_too_large",
    "agent_setup_failed",
    "turn_unconfirmed",
    "unexplained",
    "engine_verdict",
  ] as const)
    expect(turnErrorDisposition(cls), cls).toBe("failure");
});
