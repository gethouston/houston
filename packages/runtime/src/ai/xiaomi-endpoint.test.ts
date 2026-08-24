import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  activeXiaomiEndpoint,
  setXiaomiEndpointIn,
  withXiaomiBaseUrl,
  xiaomiOfferedModelIds,
  xiaomiProbeOrder,
} from "./xiaomi-endpoint";

// Xiaomi endpoint persistence + overlay (PRODUCT-1502): a Token Plan key's
// verified gateway must reach every model read, and a data dir that never
// verified one stays on the general endpoint.

const dir = () => mkdtempSync(join(tmpdir(), "houston-xiaomi-endpoint-"));

test("an unverified data dir defaults to the general endpoint", () => {
  expect(activeXiaomiEndpoint(dir()).id).toBe("general");
});

test("the persisted endpoint round-trips and an unknown id throws", () => {
  const d = dir();
  setXiaomiEndpointIn(d, "token-plan-sgp");
  expect(activeXiaomiEndpoint(d).baseUrl).toBe(
    "https://token-plan-sgp.xiaomimimo.com/v1",
  );
  expect(() => setXiaomiEndpointIn(d, "nope")).toThrow(
    /unknown xiaomi endpoint/,
  );
});

test("withXiaomiBaseUrl swaps the catalog's general URL for the verified gateway", () => {
  const d = dir();
  setXiaomiEndpointIn(d, "token-plan-ams");
  const model = {
    id: "mimo-v2.5",
    provider: "xiaomi",
    baseUrl: "https://api.xiaomimimo.com/v1",
  } as never;
  expect(withXiaomiBaseUrl(model, d)).toMatchObject({
    baseUrl: "https://token-plan-ams.xiaomimimo.com/v1",
  });
  // A non-xiaomi model passes through untouched.
  const other = {
    id: "x",
    provider: "deepseek",
    baseUrl: "https://d",
  } as never;
  expect(withXiaomiBaseUrl(other, d)).toBe(other);
});

test("a token-plan endpoint hides models its gateway does not serve", () => {
  const d = dir();
  const all = ["mimo-v2.5", "mimo-v2.5-pro", "mimo-v2.5-pro-ultraspeed"];
  expect(xiaomiOfferedModelIds(all, d)).toEqual(all);
  setXiaomiEndpointIn(d, "token-plan-sgp");
  expect(xiaomiOfferedModelIds(all, d)).toEqual(["mimo-v2.5", "mimo-v2.5-pro"]);
});

test("probe order: general first for sk- keys, plan gateways first for tp- keys", () => {
  expect(xiaomiProbeOrder("sk-abc")[0]?.id).toBe("general");
  const tp = xiaomiProbeOrder("tp-abc").map((e) => e.id);
  expect(tp).toEqual([
    "token-plan-sgp",
    "token-plan-ams",
    "token-plan-cn",
    "general",
  ]);
});
