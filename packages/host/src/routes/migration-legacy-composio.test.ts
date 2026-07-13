import { expect, test } from "vitest";
import {
  legacyConnectedToolkits,
  normalizeToolkitSlugs,
  parseLegacyComposioConfig,
} from "./migration-legacy-composio";

/**
 * The legacy `~/.composio` consumer-account probe feeding the wizard's
 * reconnect checklist. Everything is injected (file read + fetch), so these
 * run hermetically; the REST shapes mirror the Rust engine's cli.rs calls.
 */

const CONFIG = JSON.stringify({
  api_key: "uak_test",
  base_url: "https://backend.composio.dev/",
  org_id: "ok_test",
});

function fakeFetch(
  handler: (url: string) => { status: number; body: unknown } | null,
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = handler(url);
    if (!hit) throw new Error(`unexpected fetch: ${url}`);
    return new Response(JSON.stringify(hit.body), { status: hit.status });
  }) as typeof fetch;
}

test("parses the user_data.json shapes (trailing-slash base, defaults)", () => {
  expect(parseLegacyComposioConfig(CONFIG)).toEqual({
    apiKey: "uak_test",
    baseUrl: "https://backend.composio.dev",
    orgId: "ok_test",
  });
  // Minimal file: base_url + org_id default.
  expect(parseLegacyComposioConfig('{"api_key":"k"}')).toEqual({
    apiKey: "k",
    baseUrl: "https://backend.composio.dev",
    orgId: "",
  });
  expect(parseLegacyComposioConfig('{"api_key":""}')).toBeNull();
  expect(parseLegacyComposioConfig("not json")).toBeNull();
});

test("normalizes slugs like the Rust engine (trim, lowercase, dedupe, sort)", () => {
  expect(
    normalizeToolkitSlugs(["GMAIL", " googledrive ", "gmail", "", 42]),
  ).toEqual(["gmail", "googledrive"]);
  expect(normalizeToolkitSlugs("nope")).toEqual([]);
});

test("resolves the consumer project then lists its connected toolkits", async () => {
  const seen: string[] = [];
  const slugs = await legacyConnectedToolkits({
    readTextFile: async () => CONFIG,
    homeDir: () => "/home/u",
    fetchFn: fakeFetch((url) => {
      seen.push(url);
      if (url.endsWith("/api/v3/org/consumer/project/resolve")) {
        return {
          status: 200,
          body: { consumer_user_id: "consumer-1-ok_test" },
        };
      }
      if (url.includes("/api/v3/org/consumer/connected_toolkits")) {
        return { status: 200, body: { toolkits: ["GMAIL", "googledrive"] } };
      }
      return null;
    }),
  });
  expect(slugs).toEqual(["gmail", "googledrive"]);
  expect(seen[1]).toContain("user_id=consumer-1-ok_test");
});

test("every failure mode reads as no legacy account, never a throw", async () => {
  // No file on disk (fresh machine / never connected).
  expect(
    await legacyConnectedToolkits({
      readTextFile: async () => {
        throw new Error("ENOENT");
      },
      fetchFn: fakeFetch(() => null),
    }),
  ).toEqual([]);
  // Expired/revoked key: resolve answers 401.
  expect(
    await legacyConnectedToolkits({
      readTextFile: async () => CONFIG,
      fetchFn: fakeFetch(() => ({ status: 401, body: {} })),
    }),
  ).toEqual([]);
  // Network down.
  expect(
    await legacyConnectedToolkits({
      readTextFile: async () => CONFIG,
      fetchFn: (async () => {
        throw new Error("network down");
      }) as typeof fetch,
    }),
  ).toEqual([]);
});
