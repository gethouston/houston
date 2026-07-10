import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and dashes non-alphanumeric runs", () => {
    expect(slugify("Inbox Triage Helper")).toBe("inbox-triage-helper");
    expect(slugify("Data   Science!!")).toBe("data-science");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
    expect(slugify("***edge***")).toBe("edge");
  });

  it("returns empty string when nothing survives", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("   ")).toBe("");
  });

  it("caps at 64 characters", () => {
    const long = "a".repeat(200);
    expect(slugify(long)).toHaveLength(64);
  });
});
