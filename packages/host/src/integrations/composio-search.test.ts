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

test("resolves an app name to its slug (name or slug as a token run of the query)", () => {
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

test("an app name inside a longer WORD does not count as named", () => {
  // "inbox" must not resolve the app "box": the old bare-substring match did,
  // which suppressed the connected-apps fallback for a query naming no app.
  const catalog: Toolkit[] = [
    { slug: "box", name: "Box" },
    { slug: "linear", name: "Linear" },
  ];
  expect(
    resolveCatalogToolkits(catalog, "check my inbox for the invoice"),
  ).toEqual([]);
  // A whole word still matches, including as part of a token run.
  expect(
    resolveCatalogToolkits(catalog, "in linear, list my issues").map(
      (t) => t.slug,
    ),
  ).toEqual(["linear"]);
});

test("prefers the longest (most specific) name and caps the result", () => {
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

test("resolveScopeToolkits: an EXACT match resolves even a 1-2 char app name", () => {
  // The length guard exists for the loose tier only — "HR" passed exactly must
  // resolve, or the tool renders a false "no such app" for a real app.
  const catalog: Toolkit[] = [{ slug: "hr", name: "HR" }, ...CATALOG];
  expect(resolveScopeToolkits(catalog, "HR").map((t) => t.slug)).toEqual([
    "hr",
  ]);
  // Loose matching for a short scope still refuses to guess.
  expect(resolveScopeToolkits(CATALOG, "gm")).toEqual([]);
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
});

test("resolveScopeToolkits: a loose scope matching SEVERAL apps yields only the closest one", () => {
  // "hub" is a substring of both — hard-scoping to two unrelated apps would
  // recreate the ranking pollution the scope exists to eliminate.
  const catalog: Toolkit[] = [
    { slug: "github", name: "GitHub" },
    { slug: "hubspot", name: "HubSpot" },
  ];
  expect(resolveScopeToolkits(catalog, "hub")).toHaveLength(1);
});

test("resolveScopeToolkits: the closest candidate is judged on slug AND name", () => {
  // The match is on the SLUG ("linearb" ⊂ scope): judging distance on the name
  // alone would pick Linear (name length 6 vs scope 14) over LinearB.
  const catalog: Toolkit[] = [
    { slug: "linear", name: "Linear" },
    { slug: "linearb", name: "LinearB Engineering Metrics" },
  ];
  expect(
    resolveScopeToolkits(catalog, "linearb metrics").map((t) => t.slug),
  ).toEqual(["linearb"]);
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
  expect(out.scope).toBe("resolved");
  expect(out.items.map((m) => m.action)).toEqual(["POSTHOG_LIST_PERSONS"]);
  expect(out.items[0]?.status).toBe("connected");
  // Hard filter: no global or connected-scoped query ever ran.
  expect(calls.every((q) => q.toolkit_slug === "posthog")).toBe(true);
});

test("explicit app scope with no action match still returns the app row", async () => {
  const { deps } = fakeDeps({
    catalog: PH_CATALOG,
    reply: () => [],
  });
  const out = await searchComposio(deps, "do something odd", "posthog");
  expect(out.scope).toBe("resolved");
  expect(out.items).toEqual([
    {
      action: "",
      toolkit: "posthog",
      description: "PostHog",
      connected: false,
      status: "connectable",
    },
  ]);
});

test("an unresolvable explicit scope returns EMPTY + unresolved — the sandbox proxy owns the unscoped retry", async () => {
  // A provider-internal fallback would pollute the multi-provider merge with
  // unscoped noise ranked ahead of another provider's correctly scoped hits.
  const { deps, calls } = fakeDeps({
    connections: PH_CONNS,
    catalog: PH_CATALOG,
    reply: () => [GH_NOISE],
  });
  const out = await searchComposio(deps, "list my repos", "frobnicator");
  expect(out).toEqual({ items: [], scope: "unresolved" });
  expect(calls).toEqual([]);
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
  expect(out.scope).toBeUndefined();
  expect(out.items.map((m) => m.action)).toEqual([
    "POSTHOG_LIST_PERSONS",
    "GITHUB_LIST_REPOS",
  ]);
});

test("a CONNECTED app named in a zero-scoring query lists its actions in ONE search", async () => {
  // The Clockify repro: "En Clockify, dime cuánto tiempo he registrado esta
  // semana" scores zero everywhere. The user said the app and already has it —
  // its real slugs must surface NOW via the listing fallback, not after a
  // model-driven scoped re-search (the 3x "Looked through your apps" ladder).
  const { deps, calls } = fakeDeps({
    connections: PH_CONNS,
    catalog: PH_CATALOG,
    reply: (q) => (q.toolkit_slug === "posthog" && !q.query ? [PH_TOOL] : []),
  });
  const out = await searchComposio(deps, "in posthog, get the top users");
  expect(out.items.map((m) => m.action)).toEqual(["POSTHOG_LIST_PERSONS"]);
  expect(calls.some((q) => q.toolkit_slug === "posthog" && !q.query)).toBe(
    true,
  );
});

test("an UNCONNECTED query-resolved app never floods via the listing fallback", async () => {
  // Named query scores zero → the app surfaces as a toolkit ROW (the model
  // re-searches with `app` for the deterministic listing), NOT as 50 actions.
  const conns: Connection[] = [
    { toolkit: "github", connectionId: "ca_g", status: "active" },
  ];
  const { deps, calls } = fakeDeps({
    connections: conns,
    catalog: PH_CATALOG,
    reply: (q) => {
      if (q.toolkit_slug === "posthog") return [];
      return [GH_NOISE];
    },
  });
  const out = await searchComposio(deps, "in posthog, get the top users");
  expect(out.items.map((m) => m.action)).toEqual(["GITHUB_LIST_REPOS", ""]);
  expect(out.items[1]?.toolkit).toBe("posthog");
  // No query-less listing call for the unconnected named app was made.
  expect(calls.some((q) => q.toolkit_slug === "posthog" && !q.query)).toBe(
    false,
  );
});

test("an unconnected query-resolved app's matches rank AFTER connected hits", async () => {
  // "run a linear regression on my spreadsheet" resolves the (unconnected)
  // Linear app; its loose text matches must not outrank the connected app.
  const catalog: Toolkit[] = [
    { slug: "linear", name: "Linear" },
    { slug: "googlesheets", name: "Google Sheets" },
  ];
  const conns: Connection[] = [
    { toolkit: "googlesheets", connectionId: "ca_s", status: "active" },
  ];
  const sheetsTool: ToolMatch = {
    action: "GOOGLESHEETS_ADD_ROW",
    toolkit: "googlesheets",
    description: "Add a row to a spreadsheet",
  };
  const linearTool: ToolMatch = {
    action: "LINEAR_CREATE_ISSUE",
    toolkit: "linear",
    description: "Create an issue",
  };
  const { deps } = fakeDeps({
    connections: conns,
    catalog,
    reply: (q) => {
      if (q.toolkit_slug === "linear") return [linearTool];
      if (q.toolkit_slug === "googlesheets") return [sheetsTool];
      return [linearTool];
    },
  });
  const out = await searchComposio(
    deps,
    "run a linear regression on my spreadsheet",
  );
  expect(out.items.filter((m) => m.action).map((m) => m.action)).toEqual([
    "GOOGLESHEETS_ADD_ROW",
    "LINEAR_CREATE_ISSUE",
  ]);
});

test("a query naming an app suppresses the all-connected listing dump", async () => {
  // Old failure: "en clockify, cuánto tiempo..." scored zero everywhere, and
  // the connected-toolkits fallback dumped 50 actions across EVERY connected
  // app (the wall of Canva). A named app gets its OWN listing (when connected)
  // + row; the every-connected-app dump fires only for queries naming NO app.
  const { deps, calls } = fakeDeps({
    connections: PH_CONNS,
    catalog: PH_CATALOG,
    reply: (q) => (!q.toolkit_slug && q.query ? [GH_NOISE] : []),
  });
  const out = await searchComposio(deps, "in posthog, get the top users");
  expect(out.items.map((m) => [m.action, m.toolkit])).toEqual([
    ["GITHUB_LIST_REPOS", "github"],
    ["", "posthog"],
  ]);
  // No query-less listing over the CONNECTED SET was made (the named app's own
  // single-toolkit listing is allowed; the multi-app dump is not).
  expect(calls.some((q) => !q.query && q.toolkit_slug !== "posthog")).toBe(
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
  const gmail = out.items.find((m) => m.toolkit === "gmail");
  const notion = out.items.find((m) => m.toolkit === "notion");
  expect(gmail?.accounts).toEqual([
    { id: "ca_1", label: "dan@gmail.com" },
    { id: "ca_2" },
  ]);
  expect(notion?.accounts).toBeUndefined();
});
