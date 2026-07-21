import { describe, expect, it } from "vitest";
import { resolveSearchTarget } from "./search-routing";

describe("resolveSearchTarget", () => {
  it("routes a valid @handle to the creator page", () => {
    expect(resolveSearchTarget("@alice")).toBe("/@alice");
  });

  it("normalizes case and whitespace before routing", () => {
    expect(resolveSearchTarget("  @Alice_01 ")).toBe("/@alice_01");
  });

  it("treats an @ that fails the handle grammar as a query", () => {
    // "a" is one char (grammar needs 2–30), so it is not a handle.
    expect(resolveSearchTarget("@a")).toBe("/explore?q=%40a");
  });

  it("routes plain text to explore, url-encoding the query", () => {
    expect(resolveSearchTarget("inbox triage")).toBe(
      "/explore?q=inbox%20triage",
    );
  });

  it("routes empty input to bare explore", () => {
    expect(resolveSearchTarget("   ")).toBe("/explore");
  });
});
