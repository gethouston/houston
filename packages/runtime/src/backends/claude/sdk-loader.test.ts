import { expect, test } from "vitest";
import type { ClaudeSdk } from "./sdk-loader";
import { preloadClaudeSdk } from "./sdk-loader";

test("production Claude SDK preloads share one process promise", () => {
  expect(preloadClaudeSdk()).toBe(preloadClaudeSdk());
});

test("an injected Claude SDK keeps the per-turn test seam", async () => {
  const sdk = {
    query: () => (async function* () {})(),
    createSdkMcpServer: () => ({}),
  } as unknown as ClaudeSdk;

  await expect(preloadClaudeSdk(sdk)).resolves.toEqual({ ok: true, sdk });
});
