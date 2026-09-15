import { describe, expect, test } from "vitest";
import { readGatewayInventory } from "../../../scripts/sdk-parity/gateway-inventory.ts";
import { GATEWAY_ONLY_ROUTES } from "./fixtures/gateway-only-routes";

/**
 * The gateway-only list is a claim about another repository: that the hosted
 * gateway serves each of these routes and `packages/host` never will. A line
 * for a route nobody serves would send an SDK wave to build against a route
 * that is not there — so every line is checked against the gateway's own route
 * export.
 *
 * That export is vendored into this repo (`scripts/sdk-parity/`) and read
 * through the same resolver the SDK parity gate uses, so the claim is checked
 * on every run — including CI, which holds no checkout of the private cloud
 * repo.
 */

const served = readGatewayInventory().routes;

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

  // A blanket "gateway-only" with no reason is how this list rots into
  // routes nobody remembers listing.
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
