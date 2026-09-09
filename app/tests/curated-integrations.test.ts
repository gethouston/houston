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
      const endpoint =
        c.source.kind === "mcp" ? c.source.endpoint : c.source.baseUrl;
      for (const url of [endpoint, c.website, c.signUpUrl, c.apiKeysUrl]) {
        match(url, /^https:\/\//);
      }
      ok(c.categories.length > 0);
      // No server to sign in against: an OpenAPI source is key-only, and a
      // static header is an MCP-transport concept.
      if (c.source.kind === "openapi") {
        deepStrictEqual(c.authModes, ["credential"]);
        strictEqual(c.extraHeader, undefined);
      }
    }
  });

  it("every entry's copy keys exist in the en locale (the raw key would render otherwise)", () => {
    const curated = en.curated as Record<string, Record<string, string>>;
    for (const c of CURATED_INTEGRATIONS) {
      const keys = [
        c.descriptionKey,
        c.keyHelpKey,
        c.keyTitleKey,
        c.keyDescKey,
        c.extraHeader?.labelKey,
        c.extraHeader?.helpKey,
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
    strictEqual(curatedIntegrationOf("manychat")?.name, "ManyChat");
    strictEqual(curatedIntegrationOf("gmail"), undefined);
  });

  it("points HighLevel at its MCP endpoint, token plus sub-account id", () => {
    const highlevel = curatedIntegrationOf("highlevel");
    ok(highlevel);
    // The per-client `/mcp/<client>/v2` family refuses to register unknown
    // OAuth clients; only the original endpoint signs Houston in. The
    // trailing slash is the resource its OAuth metadata names.
    deepStrictEqual(highlevel.source, {
      kind: "mcp",
      endpoint: "https://services.leadconnectorhq.com/mcp/",
    });
    // Token only, as HighLevel's help center documents; its sub-account id
    // rides as a static header next to the token.
    deepStrictEqual(highlevel.authModes, ["credential"]);
    ok(highlevel.keyHelpKey);
    ok(highlevel.providerTitleKey);
    strictEqual(highlevel.extraHeader?.name, "locationId");
    deepStrictEqual(
      curatedAddInput(highlevel, "credential", { locationId: "loc_1" }).headers,
      { locationId: "loc_1" },
    );
    strictEqual("headers" in curatedAddInput(highlevel, "credential"), false);
    deepStrictEqual(highlevel.categories, ["crm", "marketing"]);
  });

  it("points ManyChat at a committed OpenAPI document the agent can read", () => {
    const manychat = curatedIntegrationOf("manychat");
    ok(manychat);
    strictEqual(manychat.source.kind, "openapi");
    if (manychat.source.kind !== "openapi") return;
    strictEqual(manychat.source.baseUrl, "https://api.manychat.com");
    const doc = JSON.parse(manychat.source.spec) as {
      openapi: string;
      servers: { url: string }[];
      paths: Record<string, Record<string, Record<string, unknown>>>;
      components: { securitySchemes: Record<string, { scheme?: string }> };
    };
    match(doc.openapi, /^3\./);
    deepStrictEqual(doc.servers, [{ url: "https://api.manychat.com" }]);
    strictEqual(doc.components.securitySchemes.Bearer?.scheme, "bearer");
    const ops = Object.entries(doc.paths).flatMap(([path, item]) =>
      Object.entries(item).map(([method, op]) => ({ path, method, ...op })),
    );
    ok(ops.length >= 30, `only ${ops.length} operations`);
    for (const op of ops) {
      // ManyChat's published document names every operation by an MD5 hash
      // with an empty summary; the committed copy exists so the agent sees
      // `subscriber.findByName`, never `subscriber.e5c671d1…`.
      match(String(op.operationId), /^[a-z][A-Za-z]+$/, op.path);
      strictEqual(op.operationId, op.path.split("/").at(-1));
      ok(String(op.summary).length > 8, `no summary for ${op.path}`);
      deepStrictEqual(op.security, [{ Bearer: [] }]);
    }
    // The message payload must accept real content (the upstream document
    // declares it as an empty closed object).
    const send = doc.paths["/fb/sending/sendContent"]?.post as {
      requestBody: {
        content: {
          "application/json": {
            schema: { properties: { data: Record<string, unknown> } };
          };
        };
      };
    };
    const data =
      send.requestBody.content["application/json"].schema.properties.data;
    strictEqual(data.additionalProperties, undefined);
    ok(typeof data.description === "string");
    deepStrictEqual(manychat.categories, [
      "marketing-automation",
      "ai-chatbots",
    ]);
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
      ["croma", "manychat"],
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
  it("materializes an OpenAPI source as a key-only definition, whatever mode was asked", () => {
    const manychat = curatedIntegrationOf("manychat");
    ok(manychat);
    for (const auth of ["oauth", "credential"] as const) {
      const input = curatedAddInput(manychat, auth, { ignored: "x" });
      strictEqual(input.kind, "openapi");
      if (input.kind !== "openapi") return;
      strictEqual(input.auth, "credential");
      strictEqual(input.slug, "manychat");
      strictEqual(input.baseUrl, "https://api.manychat.com");
      strictEqual(input.website, "https://manychat.com");
      strictEqual(input.replace, true);
      ok(input.spec?.startsWith("{"));
      strictEqual("headers" in input, false);
    }
  });

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
