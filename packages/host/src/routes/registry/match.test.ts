import { expect, test } from "vitest";
import { generalises, matchPath, patternParams } from "./match";

/**
 * The matcher reproduces the hand-written regexes exactly, including the parts
 * that look like bugs and are behaviour: no trailing-slash normalisation, no
 * empty captures, and a fall-through (not a 400) when a segment will not decode.
 */

test("a literal path matches only itself", () => {
  expect(matchPath("/health", "/health")).toEqual({ params: {}, rest: "" });
  expect(matchPath("/health", "/health/")).toBeNull();
  expect(matchPath("/health", "/healthz")).toBeNull();
  expect(matchPath("/health", "/v1/health")).toBeNull();
});

test(":name captures exactly one segment and decodes it", () => {
  expect(
    matchPath("/agents/:agentId/activity", "/agents/a%20b/activity"),
  ).toEqual({
    params: { agentId: "a b" },
    rest: "",
  });
  // Two segments never collapse into one parameter — `([^/]+)`.
  expect(matchPath("/agents/:agentId", "/agents/a/b")).toBeNull();
  // An empty segment is not a capture: `/agents//activity` matches nothing.
  expect(
    matchPath("/agents/:agentId/activity", "/agents//activity"),
  ).toBeNull();
});

test("a segment that will not decode makes the route NOT match", () => {
  // routes/custom-integrations.ts returns null on URIError rather than 400, so
  // the request must keep travelling down the chain to the same 404 it gets today.
  expect(matchPath("/agents/:agentId", "/agents/%E0%A4%A")).toBeNull();
});

test("*rest takes the remainder, raw, and needs at least one segment", () => {
  expect(
    matchPath("/agents/:agentId/*rest", "/agents/a/conversations/c1"),
  ).toEqual({ params: { agentId: "a" }, rest: "conversations/c1" });
  // Raw: the runtime channel forwards these bytes exactly as they arrived.
  expect(
    matchPath("/agents/:agentId/*rest", "/agents/a/files/a%2Fb")?.rest,
  ).toBe("files/a%2Fb");
  expect(matchPath("/agents/:agentId/*rest", "/agents/a/")).toBeNull();
  expect(matchPath("/agents/:agentId/*rest", "/agents/a")).toBeNull();
});

test("patternParams lists the captures a pattern declares, in order", () => {
  expect(patternParams("/agents/:agentId/routines/:routineId/runs")).toEqual([
    "agentId",
    "routineId",
  ]);
  expect(patternParams("/agents/:agentId/*rest")).toEqual(["agentId"]);
});

test("generalises compares patterns structurally, never by sampling", () => {
  expect(
    generalises("/agents/:agentId/*rest", "/agents/:agentId/activity"),
  ).toBe(true);
  expect(generalises("/agents/:agentId", "/agents/:agentId")).toBe(true);
  expect(
    generalises("/agents/:agentId/activity", "/agents/:agentId/*rest"),
  ).toBe(false);
  expect(generalises("/v1/agents/:agentId", "/agents/:agentId")).toBe(false);
  // A specific path is never a generalisation of a parameterised one.
  expect(generalises("/agents/fixed", "/agents/:agentId")).toBe(false);
});
