import { expect, test, vi } from "vitest";
import { multiAccountsByToolkit } from "./composio-annotate";
import {
  normalizeAppName,
  resolveCatalogToolkits,
  resolveScopeToolkits,
} from "./composio-resolve";
import {
  actionSlugOf,
  type SearchDeps,
  searchComposio,
} from "./composio-search";
import type { Connection, Toolkit, ToolMatch } from "./types";

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
  expect(
    resolveCatalogToolkits(CATALOG, "get a route from google_maps").map(
      (t) => t.slug,
    ),
  ).toEqual(["google_maps"]);
});

test("an app name inside a longer WORD does not count as named", () => {
  const catalog: Toolkit[] = [
    { slug: "box", name: "Box" },
    { slug: "linear", name: "Linear" },
  ];
  expect(
    resolveCatalogToolkits(catalog, "check my inbox for the invoice"),
  ).toEqual([]);
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

test("resolveScopeToolkits: an exact name/slug match wins outright", () => {
  expect(resolveScopeToolkits(CATALOG, "PostHog")).toEqual([]);
  expect(
    resolveScopeToolkits(CATALOG, "Google Sheets").map((t) => t.slug),
  ).toEqual(["googlesheets"]);
  expect(resolveScopeToolkits(CATALOG, "gmail").map((t) => t.slug)).toEqual([
    "gmail",
  ]);
  const many: Toolkit[] = [
    { slug: "google", name: "Google" },
    { slug: "googlesheets", name: "Google Sheets" },
  ];
  expect(resolveScopeToolkits(many, "google").map((t) => t.slug)).toEqual([
    "google",
  ]);
});

test("resolveScopeToolkits: an EXACT match resolves even a 1-2 char app name", () => {
  const catalog: Toolkit[] = [{ slug: "hr", name: "HR" }, ...CATALOG];
  expect(resolveScopeToolkits(catalog, "HR").map((t) => t.slug)).toEqual([
    "hr",
  ]);
  expect(resolveScopeToolkits(CATALOG, "gm")).toEqual([]);
});

test("resolveScopeToolkits: near matches work both ways, closest length first", () => {
  expect(
    resolveScopeToolkits(CATALOG, "google sheet").map((t) => t.slug),
  ).toEqual(["googlesheets"]);
  expect(
    resolveScopeToolkits(CATALOG, "gmail inbox").map((t) => t.slug),
  ).toEqual(["gmail"]);
});

test("resolveScopeToolkits: a loose scope matching SEVERAL apps yields only the closest one", () => {
  const catalog: Toolkit[] = [
    { slug: "github", name: "GitHub" },
    { slug: "hubspot", name: "HubSpot" },
  ];
  expect(resolveScopeToolkits(catalog, "hub")).toHaveLength(1);
});

test("resolveScopeToolkits: the closest candidate is judged on slug AND name", () => {
  const catalog: Toolkit[] = [
    { slug: "linear", name: "Linear" },
    { slug: "linearb", name: "LinearB Engineering Metrics" },
  ];
  expect(
    resolveScopeToolkits(catalog, "linearb metrics").map((t) => t.slug),
  ).toEqual(["linearb"]);
});

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
  expect(calls.every((q) => q.toolkit_slug === "posthog")).toBe(true);
});

test("a slug-shaped scoped query fetches that action directly and ranks it first", async () => {
  const catalog: Toolkit[] = [{ slug: "whatsapp", name: "WhatsApp" }];
  const page: ToolMatch[] = ["BLOCK_USERS", "SEND_CONTACTS"].map((n) => ({
    action: `WHATSAPP_${n}`,
    toolkit: "whatsapp",
    description: n,
  }));
  const send: ToolMatch = {
    action: "WHATSAPP_SEND_MESSAGE",
    toolkit: "whatsapp",
    description: "Send a text message",
  };
  const { deps, calls } = fakeDeps({
    catalog,
    reply: (q) => (q.tool_slugs === "WHATSAPP_SEND_MESSAGE" ? [send] : page),
  });
  const out = await searchComposio(deps, "WHATSAPP_SEND_MESSAGE", "whatsapp");
  expect(out.items.map((m) => m.action)).toEqual([
    "WHATSAPP_SEND_MESSAGE",
    "WHATSAPP_BLOCK_USERS",
    "WHATSAPP_SEND_CONTACTS",
  ]);
  expect(calls).toContainEqual({
    tool_slugs: "WHATSAPP_SEND_MESSAGE",
    toolkit_slug: "whatsapp",
  });
  const plain = fakeDeps({ catalog, reply: () => page });
  await searchComposio(plain.deps, "send a text", "whatsapp");
  expect(plain.calls.some((q) => "tool_slugs" in q)).toBe(false);
});

test("a failed exact lookup falls back to the scoped page instead of failing the search", async () => {
  const catalog: Toolkit[] = [{ slug: "whatsapp", name: "WhatsApp" }];
  const page: ToolMatch[] = [
    { action: "WHATSAPP_BLOCK_USERS", toolkit: "whatsapp", description: "b" },
  ];
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { deps } = fakeDeps({
    catalog,
    reply: (q) => {
      if (q.tool_slugs) throw new Error("composio 500");
      return page;
    },
  });
  const out = await searchComposio(deps, "WHATSAPP_SEND_MESSAGE", "whatsapp");
  expect(out.items.map((m) => m.action)).toEqual(["WHATSAPP_BLOCK_USERS"]);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("an exact lookup never pulls another toolkit's action into a scoped result", async () => {
  const { deps } = fakeDeps({
    catalog: [{ slug: "zoho", name: "Zoho" }],
    reply: (q) =>
      q.tool_slugs
        ? [{ action: q.tool_slugs, toolkit: "zoho_books", description: "x" }]
        : [],
  });
  const out = await searchComposio(deps, "ZOHO_BOOKS_CREATE_INVOICE", "zoho");
  expect(out.items.map((m) => m.action)).not.toContain(
    "ZOHO_BOOKS_CREATE_INVOICE",
  );
});

test("actionSlugOf: only an UPPER_SNAKE slug prefixed by the toolkit counts", () => {
  expect(actionSlugOf("WHATSAPP_SEND_MESSAGE", "whatsapp")).toBe(
    "WHATSAPP_SEND_MESSAGE",
  );
  expect(actionSlugOf(" whatsapp_send_message ", "whatsapp")).toBe(
    "WHATSAPP_SEND_MESSAGE",
  );
  expect(actionSlugOf("GMAIL_SEND_EMAIL", "whatsapp")).toBeNull();
  expect(actionSlugOf("send whatsapp message", "whatsapp")).toBeNull();
  expect(actionSlugOf("WHATSAPP", "whatsapp")).toBeNull();
  expect(actionSlugOf("WHATSAPP_", "whatsapp")).toBeNull();
  expect(actionSlugOf("GOOGLESHEETS_BATCH_GET", "google-sheets")).toBe(
    "GOOGLESHEETS_BATCH_GET",
  );
});

test.each([
  "google_maps",
  "google-maps",
  "google maps",
])("exact lookup accepts compact and underscored action prefixes for %s", async (toolkit) => {
  for (const action of ["GOOGLE_MAPS_SEARCH", "GOOGLEMAPS_SEARCH"]) {
    expect(actionSlugOf(action, toolkit)).toBe(action);
    const target = { action, toolkit, description: "Search places" };
    const { deps, calls } = fakeDeps({
      catalog: [{ slug: toolkit, name: "Google Maps" }],
      reply: (q) => (q.tool_slugs === action ? [target] : []),
    });
    const result = await searchComposio(deps, action, toolkit);
    expect(calls).toContainEqual({ tool_slugs: action, toolkit_slug: toolkit });
    expect(result.items[0]?.action).toBe(action);
  }
  expect(actionSlugOf("GOOGLE_MAPS_", toolkit)).toBeNull();
  expect(actionSlugOf("GOOGLE_MAPS_OTHER_SEARCH", "google-map")).toBeNull();
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
  expect(calls.some((q) => q.toolkit_slug === "posthog" && !q.query)).toBe(
    false,
  );
});

test("an unconnected query-resolved app's matches rank AFTER connected hits", async () => {
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
  expect(calls.some((q) => !q.query && q.toolkit_slug !== "posthog")).toBe(
    false,
  );
});

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
  expect(map.get("gmail")).toEqual([
    { id: "ca_1", label: "dan@gmail.com" },
    { id: "ca_2" },
  ]);
  expect(map.has("notion")).toBe(false);
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
