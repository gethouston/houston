import { expect, test } from "vitest";
import type { TurnDeps } from "./deps";
import { dispatchTurn } from "./start-turn";

test("a non-cloud provider pin throws with the real reason (never a silent fallback)", async () => {
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
  ).rejects.toThrow("Claude is not available for cloud agents");
});
