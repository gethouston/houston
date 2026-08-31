import { deepStrictEqual, match, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { CustomIntegrationView } from "../../ui/engine-client/src/types.ts";
import {
  CURATED_INTEGRATIONS,
  curatedAddInput,
  curatedIntegrationOf,
  curatedToolkits,
  initialCuratedStep,
} from "../src/components/integrations/curated-integrations.ts";

const describeOf = (c: { slug: string }) => `about ${c.slug}`;

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
      // The explicit logo exists because the favicon fallback would guess
      // `<slug>.com`, which is NOT the brand domain for these services.
      match(c.logoUrl, /^https:\/\//);
      ok(c.categories.length > 0);
    }
  });

  it("looks up an entry by slug", () => {
    strictEqual(curatedIntegrationOf("croma")?.name, "Croma");
    strictEqual(curatedIntegrationOf("gmail"), undefined);
  });
});

describe("curatedToolkits", () => {
  it("lists every entry as a browse toolkit with the resolved blurb", () => {
    const toolkits = curatedToolkits([], describeOf);
    const croma = toolkits.find((t) => t.slug === "croma");
    ok(croma);
    strictEqual(croma.name, "Croma");
    strictEqual(croma.description, "about croma");
    ok(croma.logoUrl);
    deepStrictEqual(croma.categories, ["legal"]);
  });

  it("excludes entries the user already added, in any state", () => {
    const toolkits = curatedToolkits([addedCroma], describeOf);
    strictEqual(
      toolkits.find((t) => t.slug === "croma"),
      undefined,
    );
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

describe("initialCuratedStep", () => {
  it("forks only where the browser sign-in can actually run", () => {
    strictEqual(initialCuratedStep(true), "choose");
    strictEqual(initialCuratedStep(false), "key");
  });
});
