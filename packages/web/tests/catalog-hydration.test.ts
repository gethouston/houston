import {
  getVisibleProviders,
  hydrateProviderCatalog,
  PROVIDERS,
} from "@houston/app/lib/providers.ts";
import { FAKE_TOKEN, type FakeHost, startFakeHost } from "@houston/fake-host";
import { afterAll, beforeAll, expect, test } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";

/**
 * End-to-end guard for the AI Models page against the fake host: the app's
 * `getCatalog()` must reach `GET /v1/catalog`, and hydrating from it must yield
 * a NON-EMPTY provider + model set.
 *
 * Regression: the fake host had no `/v1/catalog` route, so `getCatalog()`
 * 404-degraded to `[]`, `hydrateProviderCatalog` kept the override-only seed
 * (all providers, ZERO models), and the AI Models page showed ~10 providers /
 * 0 models. This drives the REAL client against the REAL fake-host route so the
 * whole path (fetch → parse → hydrate → visibility) can't silently empty again.
 */

let host: FakeHost;

beforeAll(async () => {
  host = await startFakeHost(0);
});

afterAll(async () => {
  await host.stop();
});

test("getCatalog() hydrates a non-empty provider + model set from the fake host", async () => {
  const client = new HoustonClient({ baseUrl: host.url, token: FAKE_TOKEN });

  const catalog = await client.getCatalog();
  // The fake host serves the full local-profile pi-ai catalog, not `[]`.
  expect(catalog.length).toBeGreaterThan(20);
  expect(catalog.some((p) => p.models.length > 0)).toBe(true);

  hydrateProviderCatalog(catalog);

  // The Providers tab reads getVisibleProviders — the full runnable set, not the
  // ~10-entry override seed.
  const visible = getVisibleProviders({ newEngine: true, desktop: true });
  expect(visible.length).toBeGreaterThan(15);

  // The Models tab is non-empty: providers now carry their real model lists.
  const totalModels = visible.reduce((n, p) => n + p.models.length, 0);
  expect(totalModels).toBeGreaterThan(100);

  // A first-class provider is enriched with real models (not a bare seed card).
  const anthropic = PROVIDERS.find((p) => p.id === "anthropic");
  expect(anthropic?.models.length ?? 0).toBeGreaterThan(0);
});
