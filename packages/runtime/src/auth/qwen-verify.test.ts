import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

// Qwen region probing (HOU-1077): Alibaba Model Studio international keys are
// region-scoped, so verification must try every region and persist the one
// that accepts the key. Bodies are verbatim from live DashScope responses.

const previousDataDir = process.env.HOUSTON_DATA_DIR;

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.HOUSTON_DATA_DIR;
  else process.env.HOUSTON_DATA_DIR = previousDataDir;
  vi.resetModules();
});

const SG_REJECTED =
  '401: {"message":"Incorrect API key provided. For details, see: https://www.alibabacloud.com/help/en/model-studio/error-code#apikey-error","type":"invalid_request_error","param":null,"code":"invalid_api_key"}';

const US_FREE_TIER_EXHAUSTED =
  '{"error":{"message":"The free quota has been exhausted. To continue accessing the model on a paid basis, please complete your payment information.","type":"AllocationQuota.FreeTierOnly","param":null,"code":"AllocationQuota.FreeTierOnly"}}';

async function load() {
  const dataDir = mkdtempSync(join(tmpdir(), "houston-qwen-verify-"));
  process.env.HOUSTON_DATA_DIR = dataDir;
  vi.resetModules();
  const { verifyQwenRegions } = await import("./qwen-verify");
  const { ApiKeyVerifyError } = await import("./verify-errors");
  const { qwenRegionFileIn } = await import("../ai/qwen-dashscope");
  const persistedRegion = () => {
    const file = qwenRegionFileIn(dataDir);
    if (!existsSync(file)) return null;
    return (JSON.parse(readFileSync(file, "utf8")) as { region: string })
      .region;
  };
  return { verifyQwenRegions, ApiKeyVerifyError, persistedRegion };
}

test("a US-region key: Singapore rejects, US accepts → verified, region persisted", async () => {
  const { verifyQwenRegions, persistedRegion } = await load();
  const probed: string[] = [];
  await verifyQwenRegions("qwen", async (m) => {
    probed.push(m.baseUrl);
    return m.baseUrl.includes("dashscope-us") ? null : SG_REJECTED;
  });
  expect(probed).toHaveLength(2);
  expect(persistedRegion()).toBe("us");
});

test("US answers a billing error → still verified (auth proven), region persisted", async () => {
  // The live case that motivated this: a valid US key whose free tier ran out.
  // A garbage key can't be out of quota, so the region is the key's home.
  const { verifyQwenRegions, persistedRegion } = await load();
  await verifyQwenRegions("qwen", async (m) =>
    m.baseUrl.includes("dashscope-us") ? US_FREE_TIER_EXHAUSTED : SG_REJECTED,
  );
  expect(persistedRegion()).toBe("us");
});

test("a Singapore key verifies on the first probe without touching the US", async () => {
  const { verifyQwenRegions, persistedRegion } = await load();
  const probed: string[] = [];
  await verifyQwenRegions("qwen", async (m) => {
    probed.push(m.baseUrl);
    return null;
  });
  expect(probed).toHaveLength(1);
  expect(persistedRegion()).toBe("intl");
});

test("every region rejects the credential → invalid_key, nothing persisted", async () => {
  const { verifyQwenRegions, ApiKeyVerifyError, persistedRegion } =
    await load();
  const err = await verifyQwenRegions("qwen", async () => SG_REJECTED).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiKeyVerifyError);
  expect((err as InstanceType<typeof ApiKeyVerifyError>).reason).toBe(
    "invalid_key",
  );
  expect(persistedRegion()).toBeNull();
});

test("a region with no verdict → provider_unavailable, never 'paste it again'", async () => {
  // Singapore rejects, the US times out: the key may belong to the region
  // that gave no verdict, so burning it with invalid_key would be a lie.
  const { verifyQwenRegions, ApiKeyVerifyError } = await load();
  const err = await verifyQwenRegions("qwen", async (m) =>
    m.baseUrl.includes("dashscope-us")
      ? "qwen did not answer within 20s"
      : SG_REJECTED,
  ).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiKeyVerifyError);
  expect((err as InstanceType<typeof ApiKeyVerifyError>).reason).toBe(
    "provider_unavailable",
  );
});

test("an injected persist (the pool-worker seam) lands the region in the AGENT's dir, not the process's", async () => {
  const { verifyQwenRegions, persistedRegion } = await load();
  const { setQwenRegionIn, qwenRegionFileIn } = await import(
    "../ai/qwen-dashscope"
  );
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const agentDataDir = mkdtempSync(join(tmpdir(), "houston-qwen-agent-"));
  await verifyQwenRegions(
    "qwen",
    async (m) => (m.baseUrl.includes("dashscope-us") ? null : SG_REJECTED),
    (regionId) => setQwenRegionIn(agentDataDir, regionId),
  );
  // The worker's own data dir stays untouched...
  expect(persistedRegion()).toBeNull();
  // ...and the hydrated agent root holds the verified region.
  const { readFileSync } = await import("node:fs");
  expect(
    (
      JSON.parse(readFileSync(qwenRegionFileIn(agentDataDir), "utf8")) as {
        region: string;
      }
    ).region,
  ).toBe("us");
});
