import { expect, test } from "vitest";
import { normalizeAppName, resolveCatalogToolkits } from "./composio-search";
import type { Toolkit } from "./types";

/**
 * The pure catalog resolver: it turns an app-naming query into real toolkit
 * slugs so the model always learns what to pass request_connection, even when
 * Composio's action search scores nothing. These pin the matching + guard rails.
 */

const CATALOG: Toolkit[] = [
  { slug: "googlesheets", name: "Google Sheets" },
  { slug: "gmail", name: "Gmail" },
  { slug: "google_maps", name: "Google Maps" },
  { slug: "notion", name: "Notion" },
];

test("normalizeAppName collapses case, spaces, and punctuation", () => {
  expect(normalizeAppName("Google Sheets")).toBe("googlesheets");
  expect(normalizeAppName("google-sheets")).toBe("googlesheets");
  expect(normalizeAppName("  GOOGLESHEETS ")).toBe("googlesheets");
});

test("resolves an app name to its slug (name or slug substring of the query)", () => {
  expect(
    resolveCatalogToolkits(CATALOG, "connect to google sheets").map(
      (t) => t.slug,
    ),
  ).toEqual(["googlesheets"]);
  // Matches on the slug too (multi-word slug with underscores).
  expect(
    resolveCatalogToolkits(CATALOG, "get a route from google_maps").map(
      (t) => t.slug,
    ),
  ).toEqual(["google_maps"]);
});

test("prefers the longest (most specific) name and caps the result", () => {
  // "google sheets" contains both "google sheets" and, as a plain substring of
  // the normalized form, nothing shorter here — but the longest-first ordering
  // is what keeps the most specific app on top when several match.
  const many: Toolkit[] = [
    { slug: "google", name: "Google" },
    { slug: "googlesheets", name: "Google Sheets" },
  ];
  expect(
    resolveCatalogToolkits(many, "google sheets").map((t) => t.slug),
  ).toEqual(["googlesheets", "google"]);
  expect(
    resolveCatalogToolkits(many, "google sheets", 1).map((t) => t.slug),
  ).toEqual(["googlesheets"]);
});

test("no match for a query that names no app, and an empty query", () => {
  expect(resolveCatalogToolkits(CATALOG, "please help me out")).toEqual([]);
  expect(resolveCatalogToolkits(CATALOG, "")).toEqual([]);
  expect(resolveCatalogToolkits(CATALOG, "   ")).toEqual([]);
});
