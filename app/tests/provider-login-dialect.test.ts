import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { getProvider, hydrateProviderCatalog } from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

const source = (path: string) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const SURFACES = [
  "hooks/provider-connections/use-provider-login-events.ts",
  "components/shell/provider-login-fallback.tsx",
];

before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

describe("provider login surfaces resolve event ids through the catalog alias", () => {
  it("the alias itself holds", () => {
    strictEqual(getProvider("openai-codex")?.id, "openai");
  });

  for (const surface of SURFACES) {
    it(`${surface} looks the provider up with getProvider`, () => {
      strictEqual(source(surface).includes("getProvider("), true);
    });

    it(`${surface} scans no catalog array by raw event id`, () => {
      strictEqual(/PROVIDERS\.find\(/.test(source(surface)), false);
    });

    it(`${surface} compares no keyed id against the raw event id`, () => {
      strictEqual(/=== ev\.data\.provider/.test(source(surface)), false);
    });
  }
});
