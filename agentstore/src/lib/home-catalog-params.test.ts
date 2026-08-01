import { describe, expect, it } from "vitest";
import { homeCatalogHref, parseHomeCatalogParams } from "./home-catalog-params";

describe("home catalog params", () => {
  it("normalizes invalid values", () => {
    expect(
      parseHomeCatalogParams({
        view: "unknown",
        q: "  tax  ",
        sort: "unknown",
        page: "-2",
      }),
    ).toEqual({
      view: "agents",
      q: "tax",
      category: undefined,
      sort: "installs",
      page: 1,
    });
  });

  it("builds clean crawlable agent links", () => {
    const params = parseHomeCatalogParams({
      q: "tax",
      category: "finance",
      sort: "installs",
      page: "2",
    });
    expect(homeCatalogHref(params, { page: 3 })).toBe(
      "/?q=tax&category=finance&page=3",
    );
  });

  it("serializes alphabetical while keeping installs as the clean default", () => {
    const params = parseHomeCatalogParams({ sort: "alphabetical" });
    expect(homeCatalogHref(params, {})).toBe("/?sort=alphabetical");
    expect(homeCatalogHref(params, { sort: "installs" })).toBe("/");
  });

  it("drops agent-only filters from creator links", () => {
    const params = parseHomeCatalogParams({
      category: "finance",
      sort: "installs",
    });
    expect(
      homeCatalogHref(params, { view: "creators", q: "ana", page: 1 }),
    ).toBe("/?view=creators&q=ana");
  });
});
