import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  mapProfileRows,
  normalizeUserIds,
} from "../src/hooks/queries/user-profiles-map.ts";

describe("mapProfileRows", () => {
  it("keys the map by user_id and renames to camelCase", () => {
    const map = mapProfileRows([
      { user_id: "u1", name: "Maria", avatar_url: "https://cdn/x.png" },
    ]);
    deepStrictEqual(map.get("u1"), {
      userId: "u1",
      name: "Maria",
      avatarUrl: "https://cdn/x.png",
    });
  });

  it("preserves explicit null name/avatar for a bare profile", () => {
    const map = mapProfileRows([
      { user_id: "u2", name: null, avatar_url: null },
    ]);
    deepStrictEqual(map.get("u2"), {
      userId: "u2",
      name: null,
      avatarUrl: null,
    });
  });

  it("last row wins on a duplicate user_id", () => {
    const map = mapProfileRows([
      { user_id: "u1", name: "Old", avatar_url: null },
      { user_id: "u1", name: "New", avatar_url: null },
    ]);
    deepStrictEqual(map.get("u1")?.name, "New");
    deepStrictEqual(map.size, 1);
  });

  it("returns an empty map for no rows", () => {
    deepStrictEqual(mapProfileRows([]).size, 0);
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
