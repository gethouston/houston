import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type RoutineProviderStatusLike,
  routineHealthBlocksRun,
  routineHealthOffersConnect,
  routineProviderHealth,
} from "../src/lib/routine-provider-health.ts";

describe("routineProviderHealth", () => {
  it("no status yet is checking, never 'not connected'", () => {
    strictEqual(routineProviderHealth(undefined), "checking");
  });

  for (const health of [
    "connected",
    "not_connected",
    "needs_reconnect",
    "out_of_credits",
  ] as const) {
    it(`passes the wire health "${health}" through`, () => {
      strictEqual(routineProviderHealth({ health }), health);
    });
  }

  it("collapses unreachable into the neutral checking state", () => {
    strictEqual(routineProviderHealth({ health: "unreachable" }), "checking");
  });

  it("a present credential keeps its richer health", () => {
    strictEqual(
      routineProviderHealth({ authenticated: true, health: "out_of_credits" }),
      "out_of_credits",
    );
    strictEqual(
      routineProviderHealth({ authenticated: true, health: "needs_reconnect" }),
      "needs_reconnect",
    );
  });

  it("a stored credential overrides a captured 'not connected'", () => {
    strictEqual(
      routineProviderHealth({
        authenticated: true,
        auth_state: "authenticated",
        health: "not_connected",
      }),
      "connected",
    );
  });

  it("a missing credential overrides a captured 'connected'", () => {
    strictEqual(
      routineProviderHealth({
        authenticated: false,
        auth_state: "unauthenticated",
        health: "connected",
      }),
      "not_connected",
    );
  });

  it("a missing credential the gateway signed out asks to sign in again", () => {
    strictEqual(
      routineProviderHealth({
        authenticated: false,
        auth_state: "unauthenticated",
        health: "needs_reconnect",
      }),
      "needs_reconnect",
    );
  });

  it("an unknown probe is checking even when a stale health is captured", () => {
    strictEqual(
      routineProviderHealth({
        authenticated: false,
        auth_state: "unknown",
        health: "not_connected",
      }),
      "checking",
    );
  });

  describe("older engine with no health field", () => {
    it("authenticated is connected", () => {
      const status: RoutineProviderStatusLike = {
        authenticated: true,
        auth_state: "authenticated",
      };
      strictEqual(routineProviderHealth(status), "connected");
    });

    it("unauthenticated is not connected", () => {
      strictEqual(
        routineProviderHealth({
          authenticated: false,
          auth_state: "unauthenticated",
        }),
        "not_connected",
      );
    });

    it("an unknown probe is checking, even with authenticated false", () => {
      strictEqual(
        routineProviderHealth({ authenticated: false, auth_state: "unknown" }),
        "checking",
      );
    });

    it("falls back to the boolean when auth_state is absent", () => {
      strictEqual(routineProviderHealth({ authenticated: true }), "connected");
      strictEqual(routineProviderHealth({}), "not_connected");
    });
  });
});

describe("routineHealthBlocksRun", () => {
  it("flags every state that fails a run", () => {
    strictEqual(routineHealthBlocksRun("not_connected"), true);
    strictEqual(routineHealthBlocksRun("needs_reconnect"), true);
    strictEqual(routineHealthBlocksRun("out_of_credits"), true);
  });

  it("never warns on connected or on an unconfirmed probe", () => {
    strictEqual(routineHealthBlocksRun("connected"), false);
    strictEqual(routineHealthBlocksRun("checking"), false);
  });
});

describe("routineHealthOffersConnect", () => {
  it("offers connect only where connecting is the remedy", () => {
    strictEqual(routineHealthOffersConnect("not_connected"), true);
    strictEqual(routineHealthOffersConnect("needs_reconnect"), true);
    strictEqual(routineHealthOffersConnect("out_of_credits"), false);
    strictEqual(routineHealthOffersConnect("connected"), false);
    strictEqual(routineHealthOffersConnect("checking"), false);
  });
});
