import { deepStrictEqual, match, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { CustomIntegrationView } from "../../ui/engine-client/src/types.ts";
import {
  CURATED_INTEGRATIONS,
  curatedAddInput,
  curatedIntegrationOf,
  curatedToolkits,
  withoutAddedCurated,
} from "../src/components/integrations/curated-integrations.ts";
import en from "../src/locales/en/integrations.json" with { type: "json" };

const describeOf = (c: { slug: string }) => `about ${c.slug}`;
const logoOf = (slug: string) => `bundled:${slug}`;

const addedCroma: CustomIntegrationView = {
  slug: "croma",
  name: "Croma",
  kind: "mcp",
  auth: "oauth",
  addedAtMs: 1,
  state: { status: "pending", authMethods: [] },
};

describe("curated catalog data", () => {
  it("every entry is slug-safe and fully addressed", () => {
    for (const c of CURATED_INTEGRATIONS) {
      // The host's CUSTOM_SLUG grammar — a violating slug would be rejected
      // at add time, turning the catalog card into a dead end.
      match(c.slug, /^[a-z0-9][a-z0-9_-]{0,63}$/);
      for (const url of [c.endpoint, c.website, c.signUpUrl, c.apiKeysUrl]) {
        match(url, /^https:\/\//);
      }
      ok(c.categories.length > 0);
    }
  });

  it("every entry's copy keys exist in the en locale (the raw key would render otherwise)", () => {
    const curated = en.curated as Record<string, Record<string, string>>;
    for (const c of CURATED_INTEGRATIONS) {
      const keys = [
        c.descriptionKey,
        c.keyHelpKey,
        c.signInTitleKey,
        c.signInDescKey,
        c.providerTitleKey,
        c.providerDescKey,
      ].filter((key): key is NonNullable<typeof key> => key !== undefined);
      for (const key of keys) {
        const [ns, slug, leaf] = key.split(".");
        strictEqual(ns, "curated");
        strictEqual(slug, c.slug);
        ok(
          typeof curated[slug]?.[leaf ?? ""] === "string",
          `missing en copy for ${key}`,
        );
      }
    }
  });

  it("looks up an entry by slug", () => {
    strictEqual(curatedIntegrationOf("croma")?.name, "Croma");
    strictEqual(curatedIntegrationOf("highlevel")?.name, "HighLevel");
    strictEqual(curatedIntegrationOf("gmail"), undefined);
  });

  it("points HighLevel at the client-agnostic LeadConnector endpoint, sign-in only", () => {
    const highlevel = curatedIntegrationOf("highlevel");
    ok(highlevel);
    // The per-client `/mcp/<client>/v2` family refuses to register unknown
    // OAuth clients; only the original endpoint signs Houston in. The
    // trailing slash is the resource its OAuth metadata names.
    strictEqual(
      highlevel.endpoint,
      "https://services.leadconnectorhq.com/mcp/",
    );
    deepStrictEqual(highlevel.authModes, ["oauth"]);
    // The consent page refuses these advertised scopes; the add input
    // carries them so the host's sign-in leaves them out.
    ok((highlevel.oauthScopeExclusions?.length ?? 0) > 0);
    deepStrictEqual(curatedAddInput(highlevel, "oauth").oauthScopeExclusions, [
      ...(highlevel.oauthScopeExclusions ?? []),
    ]);
    ok(highlevel.providerTitleKey);
    ok(highlevel.signInTitleKey);
    deepStrictEqual(highlevel.categories, ["crm", "marketing"]);
  });

  it("an entry offering a key carries the key help copy", () => {
    for (const c of CURATED_INTEGRATIONS) {
      if (c.authModes.includes("credential")) ok(c.keyHelpKey, c.slug);
      ok(c.authModes.length > 0);
    }
  });
});

describe("curatedToolkits", () => {
  it("lists every entry as a browse toolkit with the resolved blurb", () => {
    const toolkits = curatedToolkits([], describeOf, logoOf);
    const croma = toolkits.find((t) => t.slug === "croma");
    ok(croma);
    strictEqual(croma.name, "Croma");
    strictEqual(croma.description, "about croma");
    strictEqual(croma.logoUrl, "bundled:croma");
    deepStrictEqual(croma.categories, ["legal"]);
  });

  it("excludes entries the user already added, in any state", () => {
    const toolkits = curatedToolkits([addedCroma], describeOf, logoOf);
    strictEqual(
      toolkits.find((t) => t.slug === "croma"),
      undefined,
    );
    // The other entries stay listed — exclusion is per slug, never global.
    strictEqual(
      toolkits.find((t) => t.slug === "highlevel")?.name,
      "HighLevel",
    );
  });
});

describe("curated entries next to a provider catalog", () => {
  const providerCatalog = [
    { slug: "gmail", name: "Gmail", description: "", logoUrl: "" },
    // Composio lists HighLevel too — that toolkit IS the card.
    { slug: "highlevel", name: "Highlevel", description: "", logoUrl: "" },
  ];

  it("does not add a curated extra for a slug the provider catalog carries", () => {
    const toolkits = curatedToolkits([], describeOf, logoOf, providerCatalog);
    deepStrictEqual(
      toolkits.map((t) => t.slug),
      ["croma"],
    );
  });

  it("drops the provider's same-slug toolkit once the MCP definition is added", () => {
    const addedHighLevel: CustomIntegrationView = {
      ...addedCroma,
      slug: "highlevel",
      name: "HighLevel",
    };
    deepStrictEqual(
      withoutAddedCurated(providerCatalog, [addedHighLevel]).map((t) => t.slug),
      ["gmail"],
    );
    // A non-curated slug in the custom list never hides a provider app.
    deepStrictEqual(
      withoutAddedCurated(providerCatalog, [
        { ...addedCroma, slug: "gmail" },
      ]).map((t) => t.slug),
      ["gmail", "highlevel"],
    );
    deepStrictEqual(withoutAddedCurated(providerCatalog, []), providerCatalog);
  });
});

describe("curatedAddInput", () => {
  it("materializes the MCP definition idempotently in the chosen mode", () => {
    const croma = curatedIntegrationOf("croma");
    ok(croma);
    for (const auth of ["oauth", "credential"] as const) {
      const input = curatedAddInput(croma, auth);
      deepStrictEqual(input, {
        kind: "mcp",
        name: "Croma",
        endpoint: "https://api.croma.run/mcp",
        website: "https://usecroma.com",
        auth,
        slug: "croma",
        replace: true,
      });
    }
  });
});
