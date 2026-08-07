import { expect, test } from "vitest";
import {
  type CustomDefRow,
  type CustomToolRow,
  searchCustomTools,
} from "./search";

/**
 * searchCustomTools scores custom tools against a plain-language query the
 * same way the agent's integration_search tool sees Composio results: token
 * hits on the tool weigh 1, a hit on the OWNING APP's slug/name weighs 2 (the
 * user usually names the app: "acme create ticket"), and every result carries
 * connected:true/status:"connected" because a custom tool that compiled at
 * all IS the connection (unlike Composio's connect-then-use split).
 */

const defs: CustomDefRow[] = [
  { slug: "acme", name: "Acme" },
  { slug: "beta", name: "Beta" },
];

const pingTools: CustomToolRow[] = [
  {
    address: "tools.acme.org.default.ping",
    integration: "acme",
    name: "ping",
    description: "send a ping",
  },
  {
    address: "tools.beta.org.default.ping",
    integration: "beta",
    name: "ping",
    description: "send a ping",
  },
];

test("token match on tool name/description", () => {
  const results = searchCustomTools("ping", pingTools, defs);
  expect(results.map((m) => m.action).sort()).toEqual(
    ["tools.acme.org.default.ping", "tools.beta.org.default.ping"].sort(),
  );

  // A token with no hit anywhere yields nothing.
  expect(searchCustomTools("nonexistent-term", pingTools, defs)).toEqual([]);
});

test("app-name tokens weigh double: naming the app ranks its tool first", () => {
  // Both tools score identically on "ping" (+1 each); "acme" only lands on
  // the acme tool's app text (+2), so acme's tool must sort ahead of beta's
  // otherwise-identical tool.
  const results = searchCustomTools("acme ping", pingTools, defs);
  expect(results.map((m) => m.toolkit)).toEqual(["acme", "beta"]);
});

test("a zero-token query (empty or symbols-only) returns no matches", () => {
  expect(searchCustomTools("", pingTools, defs)).toEqual([]);
  expect(searchCustomTools("   ", pingTools, defs)).toEqual([]);
  expect(searchCustomTools("!!!", pingTools, defs)).toEqual([]);
});

// ── Explicit app scope (PRODUCT-1274) ────────────────────────────────────────

test("an app scope is a hard filter: only that integration's tools come back", () => {
  const results = searchCustomTools("ping", pingTools, defs, "Acme");
  expect(results.map((m) => m.action)).toEqual(["tools.acme.org.default.ping"]);
});

test("a scoped zero-score query degrades to listing the app's tools", () => {
  // "nonexistent-term" scores nothing, but the user named the app — its tools
  // must surface (the deterministic fallback), never an empty result.
  const results = searchCustomTools(
    "nonexistent-term",
    pingTools,
    defs,
    "acme",
  );
  expect(results.map((m) => m.action)).toEqual(["tools.acme.org.default.ping"]);
});

test("a scope matching no custom integration yields nothing (another provider owns it)", () => {
  expect(searchCustomTools("ping", pingTools, defs, "posthog")).toEqual([]);
});

test("an EXACT scope match excludes loose substring siblings (Acme vs Acme Staging)", () => {
  const twinDefs: CustomDefRow[] = [
    { slug: "acme", name: "Acme" },
    { slug: "acme_staging", name: "Acme Staging" },
  ];
  const twinTools: CustomToolRow[] = [
    ...pingTools.filter((t) => t.integration === "acme"),
    {
      address: "tools.acme_staging.org.default.ping",
      integration: "acme_staging",
      name: "ping",
      description: "send a ping",
    },
  ];
  const results = searchCustomTools("ping", twinTools, twinDefs, "Acme");
  expect(results.map((m) => m.toolkit)).toEqual(["acme"]);
  // No exact match → the loose both-way substring resolution still applies.
  expect(
    searchCustomTools("ping", twinTools, twinDefs, "staging").map(
      (m) => m.toolkit,
    ),
  ).toEqual(["acme_staging"]);
});

test("a scoped integration with no compiled tool still surfaces as an app row", () => {
  const results = searchCustomTools("anything", [], defs, "beta");
  expect(results).toEqual([
    {
      action: "",
      toolkit: "beta",
      description: "Beta (custom integration)",
      connected: true,
      status: "connected",
    },
  ]);
});

test("results are capped at 20 even when every tool scores", () => {
  const manyTools: CustomToolRow[] = Array.from({ length: 25 }, (_, i) => ({
    address: `tools.gen.org.default.t${i}`,
    integration: "gen",
    name: `t${i}`,
    description: "does a thing",
  }));
  const results = searchCustomTools("thing", manyTools, [
    { slug: "gen", name: "Gen" },
  ]);
  expect(results).toHaveLength(20);
});

test('a toolkit-level entry (action: "") is emitted for a def the query names but that has no scored tool', () => {
  // "emptyapp" only matches the def slug/name of `empty`, which contributes no
  // CustomToolRow at all (e.g. a freshly added spec with zero operations, or
  // simply an integration whose tools didn't match this query on their own
  // merits) — the model must still learn the slug exists.
  const tools: CustomToolRow[] = [
    {
      address: "tools.acme.org.default.ping",
      integration: "acme",
      name: "ping",
      description: "send a ping",
    },
  ];
  const results = searchCustomTools("emptyapp", tools, [
    { slug: "acme", name: "Acme" },
    { slug: "empty", name: "EmptyApp" },
  ]);
  expect(results).toEqual([
    {
      action: "",
      toolkit: "empty",
      description: "EmptyApp (custom integration)",
      connected: true,
      status: "connected",
    },
  ]);
});

test('every match carries connected:true and status:"connected" — a custom tool that exists IS connected', () => {
  const results = searchCustomTools("ping", pingTools, defs);
  expect(results.length).toBeGreaterThan(0);
  for (const m of results) {
    expect(m.connected).toBe(true);
    expect(m.status).toBe("connected");
  }
});

test("the match's action is the executor tool address, not the tool name", () => {
  const acmePing = pingTools.find((t) => t.integration === "acme");
  expect(acmePing).toBeDefined();
  const [match] = searchCustomTools("ping", acmePing ? [acmePing] : [], defs);
  expect(match?.action).toBe("tools.acme.org.default.ping");
  expect(match?.action).not.toBe("ping");
});
