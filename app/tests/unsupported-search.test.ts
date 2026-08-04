import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { unsupportedQueryOf } from "../src/components/integrations-view/unsupported-search.ts";

const toolkit = (over: {
  slug: string;
  name?: string;
  description?: string;
}) => ({
  slug: over.slug,
  name: over.name ?? over.slug,
  description: over.description ?? "",
});

const catalog = [
  toolkit({ slug: "gmail", name: "Gmail", description: "Email by Google" }),
  toolkit({
    slug: "googlesheets",
    name: "Google Sheets",
    description: "Spreadsheets",
  }),
  toolkit({ slug: "slack", name: "Slack" }),
];

describe("unsupportedQueryOf", () => {
  it("a query matching nothing anywhere reports its normalized form", () => {
    strictEqual(unsupportedQueryOf(catalog, "  GoHighLevel "), "gohighlevel");
  });

  it("collapses inner whitespace so vote variants aggregate", () => {
    strictEqual(
      unsupportedQueryOf(catalog, "go  high\tlevel"),
      "go high level",
    );
  });

  it("a name match anywhere in the catalog is supported, not missing", () => {
    strictEqual(unsupportedQueryOf(catalog, "Google Sheets"), null);
  });

  it("a slug match counts as supported", () => {
    strictEqual(unsupportedQueryOf(catalog, "googlesheets"), null);
  });

  it("a description match counts as supported (generous on purpose)", () => {
    strictEqual(unsupportedQueryOf(catalog, "spreadsheets"), null);
  });

  it("matching is case-insensitive", () => {
    strictEqual(unsupportedQueryOf(catalog, "SLACK"), null);
  });

  it("an empty or single-character query is not a request", () => {
    strictEqual(unsupportedQueryOf(catalog, ""), null);
    strictEqual(unsupportedQueryOf(catalog, "   "), null);
    strictEqual(unsupportedQueryOf(catalog, "g"), null);
  });

  it("an unloaded catalog reports nothing (loading, not demand)", () => {
    strictEqual(unsupportedQueryOf([], "gohighlevel"), null);
  });

  it("a pasted paragraph is not an app name", () => {
    strictEqual(unsupportedQueryOf(catalog, "x".repeat(81)), null);
    strictEqual(unsupportedQueryOf(catalog, "y".repeat(80)), "y".repeat(80));
  });
});
