import { describe, expect, it } from "vitest";
import { resolveActiveWorkspace } from "./selection";

const personal = { id: "default", isDefault: true };
const teamA = { id: "org:aaaaaaaaaaaaaaaa", isDefault: false };
const teamB = { id: "org:bbbbbbbbbbbbbbbb", isDefault: false };
const spaces = [personal, teamA, teamB];

describe("the initial space", () => {
  it("opens the first listed team when no choice is saved", () => {
    expect(resolveActiveWorkspace(spaces, null)).toBe(teamA);
  });
  it("respects a saved personal choice", () => {
    expect(resolveActiveWorkspace(spaces, personal.id)).toBe(personal);
  });
  it("restores the last team the person chose", () => {
    expect(resolveActiveWorkspace(spaces, teamB.id)).toBe(teamB);
  });
  it("falls back to a team when the saved membership is gone", () => {
    expect(resolveActiveWorkspace(spaces, "org:cccccccccccccccc")).toBe(teamA);
  });
  it("recognizes a team by its wire kind too", () => {
    const team = { id: "team", isDefault: false, kind: "org" as const };
    expect(resolveActiveWorkspace([personal, team], null)).toBe(team);
  });
  it("keeps a personal-only desktop on its existing space", () => {
    for (const lastId of [null, personal.id, "removed"])
      expect(resolveActiveWorkspace([personal], lastId)).toBe(personal);
  });
  it("uses the default among non-team spaces, then the first if none is default", () => {
    const other = { id: "other", isDefault: false };
    expect(resolveActiveWorkspace([other, personal], null)).toBe(personal);
    expect(resolveActiveWorkspace([other], null)).toBe(other);
  });
  it("answers null when there are no memberships", () => {
    expect(resolveActiveWorkspace([], personal.id)).toBeNull();
  });
});

it("tries the device copy after an inaccessible account value", () => {
  expect(resolveActiveWorkspace(spaces, "removed", teamB.id)).toBe(teamB);
  expect(resolveActiveWorkspace(spaces, personal.id, teamB.id)).toBe(personal);
});
