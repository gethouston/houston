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

// ── Multi-account annotation (HOU-901) ───────────────────────────────────────

import { multiAccountsByToolkit, searchComposio } from "./composio-search";
import type { Connection, ToolMatch } from "./types";

const CONNS: Connection[] = [
  {
    toolkit: "gmail",
    connectionId: "ca_1",
    status: "active",
    accountLabel: "dan@gmail.com",
  },
  { toolkit: "gmail", connectionId: "ca_2", status: "active" },
  { toolkit: "notion", connectionId: "ca_3", status: "active" },
  { toolkit: "slack", connectionId: "ca_4", status: "pending" },
  { toolkit: "slack", connectionId: "ca_5", status: "active" },
];

test("multiAccountsByToolkit lists only toolkits holding 2+ ACTIVE accounts", () => {
  const map = multiAccountsByToolkit(CONNS);
  // gmail: two actives → listed, labels carried where known.
  expect(map.get("gmail")).toEqual([
    { id: "ca_1", label: "dan@gmail.com" },
    { id: "ca_2" },
  ]);
  // notion: one active → absent (no disambiguation needed).
  expect(map.has("notion")).toBe(false);
  // slack: one active + one pending → still just one usable account → absent.
  expect(map.has("slack")).toBe(false);
});

test("search attaches the account list to matches of multi-account toolkits only", async () => {
  const gmailTool: ToolMatch = {
    action: "GMAIL_SEND_EMAIL",
    toolkit: "gmail",
    description: "Send an email",
  };
  const notionTool: ToolMatch = {
    action: "NOTION_CREATE_PAGE",
    toolkit: "notion",
    description: "Create a page",
  };
  const out = await searchComposio(
    {
      listConnections: async () => CONNS,
      queryTools: async (q) =>
        q.toolkit_slug ? [gmailTool, notionTool] : [gmailTool, notionTool],
      catalog: async () => [
        { slug: "gmail", name: "Gmail" },
        { slug: "notion", name: "Notion" },
      ],
    },
    "send email",
  );
  const gmail = out.find((m) => m.toolkit === "gmail");
  const notion = out.find((m) => m.toolkit === "notion");
  expect(gmail?.accounts).toEqual([
    { id: "ca_1", label: "dan@gmail.com" },
    { id: "ca_2" },
  ]);
  expect(notion?.accounts).toBeUndefined();
});
