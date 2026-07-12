import { describe, expect, it } from "vitest";
import {
  buildExploreHref,
  type ExploreParams,
  parseExploreParams,
} from "./search-params";

const base: ExploreParams = { sort: "recent", page: 1 };

describe("parseExploreParams", () => {
  it("defaults to recent sort on page 1 with no filters", () => {
    expect(parseExploreParams({})).toEqual(base);
  });

  it("reads filters, takes the first of array values, and trims", () => {
    const parsed = parseExploreParams({
      q: ["  invoices  ", "x"],
      category: "finance",
      integration: "gmail",
      sort: "installs",
      page: "3",
    });
    expect(parsed).toEqual({
      q: "invoices",
      category: "finance",
      integration: "GMAIL",
      sort: "installs",
      page: 3,
    });
  });

  it("floors invalid pages to 1 and rejects unknown sorts", () => {
    expect(parseExploreParams({ page: "0" }).page).toBe(1);
    expect(parseExploreParams({ page: "-4" }).page).toBe(1);
    expect(parseExploreParams({ page: "junk" }).page).toBe(1);
    expect(parseExploreParams({ sort: "sideways" }).sort).toBe("recent");
  });
});

describe("buildExploreHref", () => {
  it("omits default sort and page for a clean base URL", () => {
    expect(buildExploreHref(base)).toBe("/explore");
  });

  it("serializes active filters", () => {
    expect(
      buildExploreHref({
        q: "tax",
        category: "finance",
        integration: "GMAIL",
        sort: "installs",
        page: 2,
      }),
    ).toBe(
      "/explore?q=tax&category=finance&integration=GMAIL&sort=installs&page=2",
    );
  });

  it("resets to page 1 when a filter changes", () => {
    const current: ExploreParams = {
      category: "finance",
      sort: "recent",
      page: 4,
    };
    expect(buildExploreHref(current, { category: "sales" })).toBe(
      "/explore?category=sales",
    );
  });

  it("keeps the page when only paginating", () => {
    const current: ExploreParams = { q: "tax", sort: "recent", page: 2 };
    expect(buildExploreHref(current, { page: 3 })).toBe(
      "/explore?q=tax&page=3",
    );
  });

  it("clears a field when the patch value is null (chip toggled off)", () => {
    const current: ExploreParams = {
      category: "finance",
      sort: "recent",
      page: 3,
    };
    expect(buildExploreHref(current, { category: null })).toBe("/explore");
  });

  it("changes sort without dropping other filters", () => {
    const current: ExploreParams = { q: "tax", sort: "recent", page: 5 };
    expect(buildExploreHref(current, { sort: "installs" })).toBe(
      "/explore?q=tax&sort=installs",
    );
  });
});
