import { expect, test } from "vitest";
import { multiAccountsByToolkit } from "./composio-annotate";
import {
  normalizeAppName,
  resolveCatalogToolkits,
  resolveScopeToolkits,
} from "./composio-resolve";
import { type SearchDeps, searchComposio } from "./composio-search";
import type { Connection, Toolkit, ToolMatch } from "./types";

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

// ── Explicit app-scope resolution (PRODUCT-1274) ─────────────────────────────

test("resolveScopeToolkits: an exact name/slug match wins outright", () => {
  expect(resolveScopeToolkits(CATALOG, "PostHog")).toEqual([]);
  expect(
    resolveScopeToolkits(CATALOG, "Google Sheets").map((t) => t.slug),
  ).toEqual(["googlesheets"]);
  expect(resolveScopeToolkits(CATALOG, "gmail").map((t) => t.slug)).toEqual([
    "gmail",
  ]);
  // Exact beats every substring hit, even when others would also match.
  const many: Toolkit[] = [
    { slug: "google", name: "Google" },
    { slug: "googlesheets", name: "Google Sheets" },
  ];
  expect(resolveScopeToolkits(many, "google").map((t) => t.slug)).toEqual([
    "google",
  ]);
});

test("resolveScopeToolkits: near matches work both ways, closest length first", () => {
  // Scope shorter than the name ("google sheet" ⊂ "googlesheets").
  expect(
    resolveScopeToolkits(CATALOG, "google sheet").map((t) => t.slug),
  ).toEqual(["googlesheets"]);
  // Name shorter than the scope ("gmail" ⊂ "gmail inbox").
  expect(
    resolveScopeToolkits(CATALOG, "gmail inbox").map((t) => t.slug),
  ).toEqual(["gmail"]);
  // Too short to scope safely.
  expect(resolveScopeToolkits(CATALOG, "gm")).toEqual([]);
});

// ── The merged search + progressive named-app discovery ──────────────────────

/** Deps double that records every /tools query and answers via `reply`. */
function fakeDeps(opts: {
  connections?: Connection[];
  catalog?: Toolkit[];
  reply: (q: Record<string, string>) => ToolMatch[];
}): { deps: SearchDeps; calls: Record<string, string>[] } {
  const calls: Record<string, string>[] = [];
  return {
    calls,
    deps: {
      listConnections: async () => opts.connections ?? [],
      catalog: async () => opts.catalog ?? [],
      queryTools: async (q) => {
        calls.push(q);
        return opts.reply(q);
      },
    },
  };
}

const PH_CATALOG: Toolkit[] = [
  { slug: "github", name: "GitHub" },
  { slug: "posthog", name: "PostHog" },
];
const PH_CONNS: Connection[] = [
  { toolkit: "github", connectionId: "ca_g", status: "active" },
  { toolkit: "posthog", connectionId: "ca_p", status: "active" },
];
const GH_NOISE: ToolMatch = {
  action: "GITHUB_LIST_REPOS",
  toolkit: "github",
  description: "List repositories",
};
const PH_TOOL: ToolMatch = {
  action: "POSTHOG_LIST_PERSONS",
  toolkit: "posthog",
  description: "List persons by activity",
};

test("explicit app scope: ONLY the named app's actions, via the listing fallback", async () => {
  // The PRODUCT-1274 regression: Composio's full-text scores the phrasing at
  // zero for the named app while unrelated connected apps dominate globally.
  const { deps, calls } = fakeDeps({
    connections: PH_CONNS,
    catalog: PH_CATALOG,
    reply: (q) => {
      if (q.toolkit_slug === "posthog") return q.query ? [] : [PH_TOOL];
      return [GH_NOISE];
    },
  });
  const out = await searchComposio(
    deps,
    "get the most active users",
    "PostHog",
  );
  expect(out.map((m) => m.action)).toEqual(["POSTHOG_LIST_PERSONS"]);
  expect(out[0]?.status).toBe("connected");
  // Hard filter: no global or connected-scoped query ever ran.
  expect(calls.every((q) => q.toolkit_slug === "posthog")).toBe(true);
});

test("explicit app scope with no action match still returns the app row", async () => {
  const { deps } = fakeDeps({
    catalog: PH_CATALOG,
    reply: () => [],
  });
  const out = await searchComposio(deps, "do something odd", "posthog");
  expect(out).toEqual([
    {
      action: "",
      toolkit: "posthog",
      description: "PostHog",
      connected: false,
      status: "connectable",
    },
  ]);
});

test("an unresolvable explicit scope falls back to the merged search, never a false not-found", async () => {
  const { deps, calls } = fakeDeps({
    connections: PH_CONNS,
    catalog: PH_CATALOG,
    reply: () => [GH_NOISE],
  });
  const out = await searchComposio(deps, "list my repos", "frobnicator");
  expect(out.map((m) => m.action)).toEqual(["GITHUB_LIST_REPOS"]);
  // The merged search ran (a global, un-scoped query is among the calls).
  expect(calls.some((q) => !q.toolkit_slug)).toBe(true);
});

test("a query NAMING an app ranks that app's matches before scoped/global noise", async () => {
  const { deps } = fakeDeps({
    connections: PH_CONNS,
    catalog: PH_CATALOG,
    reply: (q) => {
      if (q.toolkit_slug === "posthog") return [PH_TOOL];
      return [GH_NOISE];
    },
  });
  const out = await searchComposio(deps, "in posthog, get the top users");
  expect(out.map((m) => m.action)).toEqual([
    "POSTHOG_LIST_PERSONS",
    "GITHUB_LIST_REPOS",
  ]);
});

test("the auto (query-resolved) path never floods via the listing fallback", async () => {
  // Named query scores zero → the app surfaces as a toolkit ROW (the model
  // re-searches with `app` for the deterministic listing), NOT as 50 actions.
  const { deps, calls } = fakeDeps({
    connections: PH_CONNS,
    catalog: PH_CATALOG,
    reply: (q) => {
      if (q.toolkit_slug === "posthog") return [];
      return [GH_NOISE];
    },
  });
  const out = await searchComposio(deps, "in posthog, get the top users");
  expect(out.map((m) => m.action)).toEqual(["GITHUB_LIST_REPOS", ""]);
  expect(out[1]?.toolkit).toBe("posthog");
  // No query-less listing call for the named app was made.
  expect(calls.some((q) => q.toolkit_slug === "posthog" && !q.query)).toBe(
    false,
  );
});

// ── Multi-account annotation (HOU-901) ───────────────────────────────────────

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
