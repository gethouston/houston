import { expect, test } from "vitest";
import { readProbeOutcome } from "./auth-cli";

/**
 * The single rule this file guards: only a parsed boolean `loggedIn` is an
 * ANSWER. Every other outcome of `claude auth status --json` used to collapse
 * into "logged out", which flipped a signed-in user's card to "Connect
 * Anthropic" mid-session.
 */

test("a parsed boolean loggedIn is the only KNOWN answer", () => {
  expect(readProbeOutcome(null, '{"loggedIn":true}')).toEqual({
    known: true,
    loggedIn: true,
  });
  // Non-zero exit + valid JSON is still a real answer: `claude auth status`
  // exits non-zero when signed out.
  expect(
    readProbeOutcome(
      Object.assign(new Error("exit 1"), {}),
      '{"loggedIn":false}',
    ),
  ).toEqual({ known: true, loggedIn: false });
});

test("a killed child is UNKNOWN, not logged out (the 10s timeout path)", () => {
  const killed = Object.assign(new Error("timed out"), {
    killed: true,
    signal: "SIGTERM" as const,
  });
  expect(readProbeOutcome(killed, "")).toEqual({
    known: false,
    reason: "probe killed (SIGTERM)",
  });
});

test("empty, non-JSON, and shape-less output are UNKNOWN", () => {
  expect(readProbeOutcome(null, "   ")).toMatchObject({ known: false });
  expect(readProbeOutcome(null, "not json at all")).toMatchObject({
    known: false,
  });
  // A future/unknown CLI shape must not be read as a sign-out either.
  expect(readProbeOutcome(null, '{"status":"ok"}')).toMatchObject({
    known: false,
  });
  expect(readProbeOutcome(null, '{"loggedIn":"yes"}')).toMatchObject({
    known: false,
  });
});
