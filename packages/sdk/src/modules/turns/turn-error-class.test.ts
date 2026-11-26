import { expect, test } from "vitest";
import {
  isSessionStatusOrigin,
  isTurnErrorClass,
  providerErrorClass,
  turnErrorDisposition,
} from "./turn-error-class";

// The vocabulary a surface reads off an untyped bus event: every named class,
// every `provider_<kind>` for a real ProviderError kind, nothing else.
test("names every class and refuses anything else", () => {
  for (const cls of [
    "stopped",
    "engine_restart",
    "sandbox_lost",
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

// What a failure counts as is the SDK's call, not a per-surface list: a Stop
// is intended, a state with its own copy or card is handled, the rest is an
// error the person saw with nothing but generic copy.
test("disposes each class once, for every surface", () => {
  expect(turnErrorDisposition("stopped")).toBe("intended");
  for (const cls of [
    "engine_restart",
    "sandbox_lost",
    "send_busy",
    "compute_busy",
    "provider_unauthenticated",
    "provider_rate_limited",
    "provider_plan_message_limit",
    "provider_provider_internal",
    "provider_malformed_response",
    // A usage limit pauses the routine until its reset with its own card.
    "provider_usage_limit_paused",
  ] as const)
    expect(turnErrorDisposition(cls), cls).toBe("handled");
  // The unclassified provider card is generic copy over a raw excerpt; a setup
  // failure and a turn lost after its 202 are authored lines over our own
  // fault, reported as bugs, so they count as errors shown too.
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
