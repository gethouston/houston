import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { GATEWAY_ONLY_ROUTES } from "./fixtures/gateway-only-routes";

/**
 * The gateway-only exception list is a claim about another repository: that the
 * hosted gateway serves each of these routes and `packages/host` never will.
 * An exception for a route nobody serves is not an exception, it is a hole in
 * the parity gate — so every line is checked against the gateway's own route
 * export.
 *
 * `cloud` is a sibling checkout, not a dependency: contributors without it are
 * warned loudly and skipped rather than failed, which is also how CI behaves
 * until the two repos are checked out together.
 */

const GATEWAY_ROUTES = resolve(
  import.meta.dirname,
  "../../../../cloud/internal/edge/routes.generated.json",
);

interface GatewayRoute {
  pattern: string;
  methods: string[];
}

const served: GatewayRoute[] | null = existsSync(GATEWAY_ROUTES)
  ? (JSON.parse(readFileSync(GATEWAY_ROUTES, "utf8")) as GatewayRoute[])
  : null;

if (!served)
  console.warn(
    `[gateway-only-routes] SKIPPED: no sibling cloud checkout at ${GATEWAY_ROUTES}. ` +
      "The gateway-only exception list is UNVERIFIED in this run — clone gethouston/cloud beside this repo to check it.",
  );

describe.skipIf(!served)(
  "every gateway-only exception names a live route",
  () => {
    test.each(Object.keys(GATEWAY_ONLY_ROUTES))("%s", (key) => {
      const [method, path] = key.split(" ");
      const route = served?.find((r) => r.pattern === path);
      expect(
        route,
        `${path} is not a route the gateway registers`,
      ).toBeDefined();
      expect(
        route?.methods.includes(method) || route?.methods.includes("*"),
        `${path} is served, but not for ${method} (it serves ${route?.methods.join(", ")})`,
      ).toBe(true);
    });

    // A blanket "gateway-only" with no reason is how an exception list rots
    // into a list of routes nobody remembers exempting.
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
  },
);
