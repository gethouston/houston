import { describe, expect, it } from "vitest";
import { buildCreatorHref } from "./creator-href";

describe("buildCreatorHref", () => {
  it("omits default sort and page", () => {
    expect(buildCreatorHref("alice")).toBe("/@alice");
    expect(buildCreatorHref("alice", { sort: "recent", page: 1 })).toBe(
      "/@alice",
    );
  });

  it("includes a non-default sort", () => {
    expect(buildCreatorHref("alice", { sort: "installs" })).toBe(
      "/@alice?sort=installs",
    );
  });

  it("includes a page above 1 and combines with sort", () => {
    expect(buildCreatorHref("alice", { sort: "installs", page: 3 })).toBe(
      "/@alice?sort=installs&page=3",
    );
  });
});
