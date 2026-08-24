import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

// Xiaomi endpoint probing (PRODUCT-1502): a Token Plan key (`tp-…`)
// authenticates only on its plan's regional gateway, never on the general
// endpoint (and vice versa for `sk-…` keys), so verification must try every
// endpoint and persist the one that accepts the key.

const previousDataDir = process.env.HOUSTON_DATA_DIR;

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.HOUSTON_DATA_DIR;
  else process.env.HOUSTON_DATA_DIR = previousDataDir;
  vi.resetModules();
});

const REJECTED =
  '401: {"error":{"message":"Invalid API key provided.","type":"invalid_request_error","code":"invalid_api_key"}}';

const NO_BALANCE =
  '402: {"error":{"message":"Insufficient balance. Please top up your account.","type":"insufficient_quota","code":"insufficient_quota"}}';

const PROBE_MODEL = {
  id: "mimo-v2.5",
  provider: "xiaomi",
  baseUrl: "https://api.xiaomimimo.com/v1",
} as never;

async function load() {
  const dataDir = mkdtempSync(join(tmpdir(), "houston-xiaomi-verify-"));
  process.env.HOUSTON_DATA_DIR = dataDir;
  vi.resetModules();
  const { verifyXiaomiEndpoints } = await import("./xiaomi-verify");
  const { ApiKeyVerifyError } = await import("./verify-errors");
  const { xiaomiEndpointFileIn } = await import("../ai/xiaomi-endpoint");
  const persistedEndpoint = () => {
    const file = xiaomiEndpointFileIn(dataDir);
    if (!existsSync(file)) return null;
    return (JSON.parse(readFileSync(file, "utf8")) as { endpoint: string })
      .endpoint;
  };
  return { verifyXiaomiEndpoints, ApiKeyVerifyError, persistedEndpoint };
}

test("a plan key WITHOUT the tp- prefix: general rejects, Singapore accepts → verified, endpoint persisted", async () => {
  const { verifyXiaomiEndpoints, persistedEndpoint } = await load();
  const probed: string[] = [];
  await verifyXiaomiEndpoints(
    "xiaomi",
    "sk-looks-general",
    PROBE_MODEL,
    async (m) => {
      probed.push(m.baseUrl as string);
      return (m.baseUrl as string).includes("token-plan-sgp") ? null : REJECTED;
    },
  );
  expect(probed).toEqual([
    "https://api.xiaomimimo.com/v1",
    "https://token-plan-sgp.xiaomimimo.com/v1",
  ]);
  expect(persistedEndpoint()).toBe("token-plan-sgp");
});

test("a `tp-` key probes the plan gateways FIRST — one round trip, not two", async () => {
  const { verifyXiaomiEndpoints, persistedEndpoint } = await load();
  const probed: string[] = [];
  await verifyXiaomiEndpoints("xiaomi", "tp-abc123", PROBE_MODEL, async (m) => {
    probed.push(m.baseUrl as string);
    return (m.baseUrl as string).includes("token-plan-sgp") ? null : REJECTED;
  });
  expect(probed).toEqual(["https://token-plan-sgp.xiaomimimo.com/v1"]);
  expect(persistedEndpoint()).toBe("token-plan-sgp");
});

test("an endpoint answering a billing error → still verified (auth proven)", async () => {
  // A garbage key can't be out of credit, so the endpoint is the key's home.
  const { verifyXiaomiEndpoints, persistedEndpoint } = await load();
  await verifyXiaomiEndpoints("xiaomi", "sk-abc", PROBE_MODEL, async (m) =>
    (m.baseUrl as string).includes("api.xiaomimimo") ? NO_BALANCE : REJECTED,
  );
  expect(persistedEndpoint()).toBe("general");
});

test("a general key verifies on the first probe without touching the gateways", async () => {
  const { verifyXiaomiEndpoints, persistedEndpoint } = await load();
  const probed: string[] = [];
  await verifyXiaomiEndpoints("xiaomi", "sk-abc", PROBE_MODEL, async (m) => {
    probed.push(m.baseUrl as string);
    return null;
  });
  expect(probed).toEqual(["https://api.xiaomimimo.com/v1"]);
  expect(persistedEndpoint()).toBe("general");
});

test("every endpoint rejects the credential → invalid_key, nothing persisted", async () => {
  const { verifyXiaomiEndpoints, ApiKeyVerifyError, persistedEndpoint } =
    await load();
  const err = await verifyXiaomiEndpoints(
    "xiaomi",
    "sk-garbage",
    PROBE_MODEL,
    async () => REJECTED,
  ).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiKeyVerifyError);
  expect((err as InstanceType<typeof ApiKeyVerifyError>).reason).toBe(
    "invalid_key",
  );
  expect(persistedEndpoint()).toBeNull();
});

test("an endpoint with no verdict → provider_unavailable, never 'paste it again'", async () => {
  // The others reject, China times out: the key may belong to the endpoint
  // that gave no verdict, so burning it with invalid_key would be a lie.
  const { verifyXiaomiEndpoints, ApiKeyVerifyError } = await load();
  const err = await verifyXiaomiEndpoints(
    "xiaomi",
    "sk-abc",
    PROBE_MODEL,
    async (m) =>
      (m.baseUrl as string).includes("token-plan-cn")
        ? "xiaomi did not answer within 20s"
        : REJECTED,
  ).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ApiKeyVerifyError);
  expect((err as InstanceType<typeof ApiKeyVerifyError>).reason).toBe(
    "provider_unavailable",
  );
});

test("an injected persist (the pool-worker seam) lands in the AGENT's dir, not the process's", async () => {
  const { verifyXiaomiEndpoints, persistedEndpoint } = await load();
  const { setXiaomiEndpointIn, xiaomiEndpointFileIn } = await import(
    "../ai/xiaomi-endpoint"
  );
  const agentDataDir = mkdtempSync(join(tmpdir(), "houston-xiaomi-agent-"));
  await verifyXiaomiEndpoints(
    "xiaomi",
    "tp-abc",
    PROBE_MODEL,
    async (m) =>
      (m.baseUrl as string).includes("token-plan-ams") ? null : REJECTED,
    (endpointId) => setXiaomiEndpointIn(agentDataDir, endpointId),
  );
  // The worker's own data dir stays untouched...
  expect(persistedEndpoint()).toBeNull();
  // ...and the hydrated agent root holds the verified endpoint.
  expect(
    (
      JSON.parse(readFileSync(xiaomiEndpointFileIn(agentDataDir), "utf8")) as {
        endpoint: string;
      }
    ).endpoint,
  ).toBe("token-plan-ams");
});
