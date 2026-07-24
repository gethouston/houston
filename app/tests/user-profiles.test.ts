import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  mapProfilesResult,
  normalizeUserIds,
  profilesQueryEnabled,
} from "../src/hooks/queries/user-profiles-map.ts";

describe("mapProfilesResult", () => {
  it("keys the map by user id and renames the wire fields", () => {
    const map = mapProfilesResult({
      u1: { displayName: "Maria", photoUrl: "https://cdn/x.png" },
    });
    deepStrictEqual(map.get("u1"), {
      userId: "u1",
      name: "Maria",
      avatarUrl: "https://cdn/x.png",
    });
  });

  it("maps an absent displayName/photoUrl to explicit null", () => {
    const map = mapProfilesResult({ u2: {} });
    deepStrictEqual(map.get("u2"), {
      userId: "u2",
      name: null,
      avatarUrl: null,
    });
  });

  it("maps just a name, avatar staying null", () => {
    const map = mapProfilesResult({ u3: { displayName: "Ana" } });
    deepStrictEqual(map.get("u3"), {
      userId: "u3",
      name: "Ana",
      avatarUrl: null,
    });
  });

  it("returns an empty map for no profiles", () => {
    deepStrictEqual(mapProfilesResult({}).size, 0);
  });
});

describe("normalizeUserIds", () => {
  it("de-duplicates and sorts so any order hits one cache key", () => {
    deepStrictEqual(normalizeUserIds(["u3", "u1", "u3", "u2"]), [
      "u1",
      "u2",
      "u3",
    ]);
  });

  it("returns an empty array unchanged", () => {
    deepStrictEqual(normalizeUserIds([]), []);
  });
});

describe("profilesQueryEnabled", () => {
  const base = { idCount: 1, authConfigured: true, multiplayer: false };

  it("the caller's OWN-profile lookup fires off multiplayer (uploaded avatar is readable)", () => {
    // Regression: before the fix, useMyProfile's own-profile fetch was
    // multiplayer-gated, so an uploaded avatar on a signed-in single-player /
    // personal-space host never appeared anywhere (write-only).
    strictEqual(profilesQueryEnabled({ ...base, alwaysEnabled: true }), true);
  });

  it("teammate face stacks stay multiplayer-gated (no roster in single-player)", () => {
    strictEqual(profilesQueryEnabled({ ...base, alwaysEnabled: false }), false);
    strictEqual(
      profilesQueryEnabled({
        ...base,
        multiplayer: true,
        alwaysEnabled: false,
      }),
      true,
    );
  });

  it("never fires without an id or a configured client, even for own-profile", () => {
    strictEqual(
      profilesQueryEnabled({ ...base, idCount: 0, alwaysEnabled: true }),
      false,
    );
    strictEqual(
      profilesQueryEnabled({
        ...base,
        authConfigured: false,
        alwaysEnabled: true,
      }),
      false,
    );
  });
});
