import { expect, test } from "vitest";
import type { TurnDeps } from "./deps";
import { dispatchTurn } from "./start-turn";

/**
 * The cloud per-turn dispatch honors a routine's provider pin. Pinned here: a
 * provider the cloud runtime can't serve fails the turn VISIBLY (the firer
 * marks the run errored with this reason) — substituting the saved provider
 * would be the silent switch the pin exists to prevent, and would send the
 * pinned model to a provider that doesn't offer it.
 */

test("a non-cloud provider pin throws with the real reason (never a silent fallback)", async () => {
  // The pin check runs before any dependency is touched, so an empty deps bag
  // proves nothing else (quota, relay, settings) was consulted first.
  await expect(
    dispatchTurn(
      {} as TurnDeps,
      { id: "ws1" } as never,
      { id: "a1" } as never,
      "c1",
      "go",
      undefined,
      { provider: "anthropic", model: "claude-opus-4-8" },
    ),
    // The catalog NAME, not the wire id: this reason reaches the routine's run
    // history, where the reader is the person who set the routine up.
  ).rejects.toThrow("Claude is not available for cloud agents");
});
