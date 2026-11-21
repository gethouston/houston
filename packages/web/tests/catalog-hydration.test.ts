import {
  getVisibleProviders,
  hydrateProviderCatalog,
  PROVIDERS,
} from "@houston/app/lib/providers.ts";
import { HoustonClient } from "@houston/engine-adapter/client";
import { FAKE_TOKEN, type FakeHost, startFakeHost } from "@houston/fake-host";
import { afterAll, beforeAll, expect, test } from "vitest";

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
  expect(catalog.length).toBeGreaterThan(20);
  expect(catalog.some((p) => p.models.length > 0)).toBe(true);

  hydrateProviderCatalog(catalog);

  const visible = getVisibleProviders({ newEngine: true, desktop: true });
  expect(visible.length).toBeGreaterThan(15);

  const totalModels = visible.reduce((n, p) => n + p.models.length, 0);
  expect(totalModels).toBeGreaterThan(100);

  const anthropic = PROVIDERS.find((p) => p.id === "anthropic");
  expect(anthropic?.models.length ?? 0).toBeGreaterThan(0);
});
