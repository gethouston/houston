import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { getProvider, hydrateProviderCatalog } from "../src/lib/providers.ts";
import { SAMPLE_CATALOG } from "./fixtures/sample-catalog.ts";

/**
 * `ProviderLoginUrl` / `ProviderLoginComplete` name their provider in pi's
 * CANONICAL dialect, while the catalog, the status map and the login dialogs
 * are keyed by Houston's DISPLAY id. Matched raw, a Codex sign-in toasts the
 * bare id "openai-codex", never flips its card to connected, and leaves the
 * dialog and the row spinner up for good.
 *
 * These surfaces are React modules the strip-types runner cannot load, so the
 * dialect rule is pinned on their source the same way the activity writer's is
 * (`activity-canonical-provider.test.ts`).
 */

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
