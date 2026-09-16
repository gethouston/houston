import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import type { OrgMember } from "@houston/engine-adapter";
import {
  orgChartBarPercent,
  orgChartRoster,
  orgChartScale,
  orgChartTeamMembership,
  orgChartTeamOrder,
  orgChartUsageState,
} from "../src/components/organization/org-chart-view-model.ts";

test("usage is hidden outright for a caller who may not read it", () => {
  strictEqual(
    orgChartUsageState({ permitted: false, isLoading: true, isError: false }),
    "hidden",
  );
  strictEqual(
    orgChartUsageState({ permitted: false, isLoading: false, isError: true }),
    "hidden",
  );
});

test("a permitted caller sees loading, then the failure, then the numbers", () => {
  strictEqual(
    orgChartUsageState({ permitted: true, isLoading: true, isError: false }),
    "loading",
  );
  strictEqual(
    orgChartUsageState({ permitted: true, isLoading: false, isError: true }),
    "error",
  );
  strictEqual(
    orgChartUsageState({ permitted: true, isLoading: false, isError: false }),
    "ready",
  );
});

test("the default team closes the chart, unless it is the whole company", () => {
  const named = { id: "a", isDefault: false };
  const other = { id: "b", isDefault: false };
  const fallback = { id: "default", isDefault: true };
  deepStrictEqual(orgChartTeamOrder([fallback, named, other]), [
    named,
    other,
    fallback,
  ]);
  deepStrictEqual(orgChartTeamOrder([fallback]), [fallback]);
  deepStrictEqual(orgChartTeamOrder([]), []);
});

test("every bar is scaled to the busiest agent in the whole chart", () => {
  strictEqual(
    orgChartScale(
      new Map([
        ["a", 4],
        ["b", 40],
      ]),
    ),
    40,
  );
  // A silent org must not divide by zero.
  strictEqual(orgChartScale(new Map([["a", 0]])), 1);
  strictEqual(orgChartScale(new Map()), 1);
});

test("a silent agent's bar is empty and a trickle still shows", () => {
  strictEqual(orgChartBarPercent(0, 40), 0);
  strictEqual(orgChartBarPercent(-3, 40), 0);
  strictEqual(orgChartBarPercent(1, 400), 2);
  strictEqual(orgChartBarPercent(20, 40), 50);
  strictEqual(orgChartBarPercent(40, 40), 100);
  // A stale scale (one card rendered against an older max) still clamps.
  strictEqual(orgChartBarPercent(80, 40), 100);
});

test("only a named team on a teams gateway spends a membership read", () => {
  deepStrictEqual(
    orgChartTeamMembership({
      personal: false,
      serverBacked: true,
      isDefault: false,
    }),
    { everyone: false, readsMembers: true },
  );
  deepStrictEqual(
    orgChartTeamMembership({
      personal: false,
      serverBacked: true,
      isDefault: true,
    }),
    { everyone: true, readsMembers: false },
  );
  // The local backend stores no human memberships: everyone is in every team.
  deepStrictEqual(
    orgChartTeamMembership({
      personal: false,
      serverBacked: false,
      isDefault: false,
    }),
    { everyone: true, readsMembers: false },
  );
  deepStrictEqual(
    orgChartTeamMembership({
      personal: true,
      serverBacked: true,
      isDefault: false,
    }),
    { everyone: true, readsMembers: false },
  );
});

const self: OrgMember = {
  userId: "me",
  role: "owner",
  displayName: "Julian",
};

test("the served roster wins wherever the gateway sends one", () => {
  const roster: OrgMember[] = [{ userId: "u1", role: "user" }];
  deepStrictEqual(orgChartRoster({ personal: false, roster, self }), roster);
  deepStrictEqual(orgChartRoster({ personal: true, roster, self }), roster);
});

test("a personal space still shows its one human, from the session", () => {
  deepStrictEqual(orgChartRoster({ personal: true, roster: [], self }), [self]);
  // A team space with no roster served stays empty rather than inventing a
  // one-person company around the caller.
  deepStrictEqual(orgChartRoster({ personal: false, roster: [], self }), []);
  deepStrictEqual(
    orgChartRoster({ personal: true, roster: [], self: null }),
    [],
  );
});
