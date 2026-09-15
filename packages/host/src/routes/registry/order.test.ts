import { expect, test } from "vitest";
import { listRoutes } from "./all";
import { GROUP_ORDER, GROUP_PHASES } from "./groups";
import { generalises } from "./match";

/**
 * Ordering is the chain's oldest load-bearing secret: registration order IS
 * match order, and several routes exist only because a more general pattern is
 * declared after them. This turns that implicit arrangement into a stated one.
 *
 * A route is unreachable when an EARLIER route's pattern covers every path it
 * covers for a method they share. Declaring the pair below is the way to say
 * "the earlier one is meant to answer for both" — anything undeclared is dead
 * code that a reader would take for a live route.
 */
const INTENTIONAL_SHADOWS: {
  earlier: string;
  later: string;
  reason: string;
}[] = [];

const shadowed = (earlier: string, later: string): boolean =>
  INTENTIONAL_SHADOWS.some(
    (entry) => entry.earlier === earlier && entry.later === later,
  );

test("no route is shadowed by an earlier, more general one", () => {
  const routes = listRoutes();
  const unreachable: string[] = [];
  for (let i = 0; i < routes.length; i++)
    for (let j = i + 1; j < routes.length; j++) {
      const earlier = routes[i];
      const later = routes[j];
      if (!earlier || !later) continue;
      if (earlier.method !== later.method) continue;
      if (!generalises(earlier.path, later.path)) continue;
      const pair = `${earlier.method} ${earlier.path} (${earlier.source}) swallows ${later.method} ${later.path} (${later.source})`;
      if (!shadowed(earlier.path, later.path)) unreachable.push(pair);
    }
  expect(unreachable).toEqual([]);
});

test("every declared shadow states a reason", () => {
  for (const entry of INTENTIONAL_SHADOWS)
    expect(entry.reason.length).toBeGreaterThan(20);
});

test("GROUP_ORDER covers every group exactly once", () => {
  expect([...GROUP_ORDER].sort()).toEqual(Object.keys(GROUP_PHASES).sort());
  expect(new Set(GROUP_ORDER).size).toBe(GROUP_ORDER.length);
});

test("a non-sdk classification always carries a written reason", () => {
  for (const route of listRoutes()) {
    if (route.classification === "sdk") {
      expect(route.reason).toBeUndefined();
      continue;
    }
    expect(route.reason?.length ?? 0).toBeGreaterThan(20);
  }
});

test("listRoutes() is pure data — every route names the module that owns it", () => {
  for (const route of listRoutes()) {
    expect(route.source).toMatch(/^packages\/host\/src\/.+\.ts$/);
    expect(GROUP_PHASES[route.group]).toBe(route.phase);
  }
});
