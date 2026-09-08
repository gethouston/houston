import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { createTurnServer } from "./server";
import { poolOnlyFallbackStore } from "./turn-store";

afterEach(() => vi.unstubAllEnvs());
test.each([
  false,
  true,
])("pool capability reports configured bridge transport: %s", async (configured) => {
  vi.stubEnv("HOUSTON_POOL_STORE_URL", "");
  const server = createTurnServer({
    store: poolOnlyFallbackStore(),
    token: "internal",
    ...(configured ? { poolStoreUrl: "http://gateway.internal" } : {}),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/capabilities`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      configured ? { localModelBridge: { versions: [1] } } : {},
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
