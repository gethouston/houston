import { expect, test } from "vitest";
import { readProbeOutcome } from "./auth-cli";

test("a parsed boolean loggedIn is the only KNOWN answer", () => {
  expect(readProbeOutcome(null, '{"loggedIn":true}')).toEqual({
    known: true,
    loggedIn: true,
  });
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
  expect(readProbeOutcome(null, '{"status":"ok"}')).toMatchObject({
    known: false,
  });
  expect(readProbeOutcome(null, '{"loggedIn":"yes"}')).toMatchObject({
    known: false,
  });
});
