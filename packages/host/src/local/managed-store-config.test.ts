import { afterEach, expect, test, vi } from "vitest";
import { managedStoreConfig } from "./managed-store-config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("shared pod-store config uses the org route and binds requests to the agent slug", async () => {
  vi.stubEnv("HOUSTON_STORE_URL", "https://store.test/");
  vi.stubEnv("HOUSTON_ORG_SLUG", "acme org");
  vi.stubEnv("HOUSTON_AGENT_SLUG", "writer");
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ objects: [] }));
  const config = await managedStoreConfig(
    "pod-token",
    "/data",
    async (message) => {
      throw new Error(message);
    },
  );
  if (!config) throw new Error("expected managed store config");

  await config.sharedMirror.store.manifest();

  expect(fetchSpy).toHaveBeenCalledWith(
    "https://store.test/v1/pod/store/acme%20org/shared/manifest",
    {
      headers: {
        Authorization: "Bearer pod-token",
        "X-Houston-Agent": "writer",
      },
    },
  );
  expect(config.sharedMirror.mirrorDir).toBe("/data/shared-mirror");
});
