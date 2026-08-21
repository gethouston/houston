import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type RoutineProviderStatusLike,
  routineHealthBlocksRun,
  routineHealthOffersConnect,
  routineProviderHealth,
  viewerIsRoutineCreator,
} from "../src/lib/routine-provider-health.ts";

/**
 * PRODUCT-1475 — a routine says which AI account it runs on and whether that
 * account works, BEFORE it fires. These pin the two things that were silently
 * wrong before: an engine with no `health` field must still answer, and an
 * unconfirmable probe must never read as either healthy or broken.
 */
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

  it("health wins over the denormalized boolean when both are present", () => {
    // Out of credits is an AUTHENTICATED credential with no quota: reading
    // `authenticated` alone would call it connected and the run would fail.
    strictEqual(
      routineProviderHealth({ authenticated: true, health: "out_of_credits" }),
      "out_of_credits",
    );
    strictEqual(
      routineProviderHealth({
        authenticated: false,
        auth_state: "unauthenticated",
        health: "connected",
      }),
      "connected",
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
    // Already connected — a sign-in would change nothing.
    strictEqual(routineHealthOffersConnect("out_of_credits"), false);
    strictEqual(routineHealthOffersConnect("connected"), false);
    strictEqual(routineHealthOffersConnect("checking"), false);
  });
});

describe("viewerIsRoutineCreator", () => {
  it("single-player (no creator) is always the viewer's own account", () => {
    strictEqual(viewerIsRoutineCreator(undefined, null), true);
    strictEqual(viewerIsRoutineCreator(undefined, "u-alice"), true);
  });

  it("matches the signed-in user id", () => {
    strictEqual(viewerIsRoutineCreator("u-alice", "u-alice"), true);
  });

  it("a teammate's routine runs on an account this viewer cannot probe", () => {
    strictEqual(viewerIsRoutineCreator("u-bob", "u-alice"), false);
    strictEqual(viewerIsRoutineCreator("u-bob", null), false);
  });
});
