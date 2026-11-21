import { describe, expect, test } from "vitest";
import { readVendoredInventory } from "../../../scripts/sdk-parity/gateway-inventory.ts";
import { GATEWAY_ONLY_ROUTES } from "./fixtures/gateway-only-routes";

const served = readVendoredInventory().routes;

describe("every gateway-only exception names a live route", () => {
  test.each(Object.keys(GATEWAY_ONLY_ROUTES))("%s", (key) => {
    const [method, path] = key.split(" ");
    const route = served.find((r) => r.pattern === path);
    expect(route, `${path} is not a route the gateway registers`).toBeDefined();
    expect(
      route?.methods.includes(method) || route?.methods.includes("*"),
      `${path} is served, but not for ${method} (it serves ${route?.methods.join(", ")})`,
    ).toBe(true);
  });

  test("no exception is carried without its own reason", () => {
    const reasons = Object.values(GATEWAY_ONLY_ROUTES);
    for (const [key, reason] of Object.entries(GATEWAY_ONLY_ROUTES)) {
      expect(reason, key).toBe(reason.trim());
      expect(reason.length, key).toBeGreaterThan(0);
      expect(
        reasons.filter((r) => r === reason),
        `${key} reuses another route's reason verbatim`,
      ).toHaveLength(1);
    }
  });
});
