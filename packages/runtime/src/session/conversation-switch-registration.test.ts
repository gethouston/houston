import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { Conversation } from "./conversation-record";

/**
 * The registry must never be empty for a module that resolves a backend.
 *
 * This suite deliberately imports conversation-switch and NOTHING else of the
 * session graph. The switches resolve through `serverBackendFor`, whose module
 * owns the registrations — where they resolved through the registry directly,
 * correctness depended on conversation-cache having been imported first for its
 * side effect, and a direct importer of the switches (or the same code reached
 * through a changed import graph) threw "No harness backend for provider" at
 * turn time.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-csr-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-csr-ws-"),
);

const { switchBackendIfNeeded } = await import("./conversation-switch");

test("switching resolves a backend without conversation-cache being loaded", async () => {
  // Already on the backend the model needs: the resolution happens, the session
  // is left alone. A throw here is the bug — an empty registry.
  const conv = {
    backendId: "anthropic",
    session: {
      dispose: () => {
        throw new Error("the session must not be torn down");
      },
    },
  } as unknown as Conversation;

  await expect(
    switchBackendIfNeeded(
      conv,
      "c1",
      { provider: "anthropic", id: "claude-sonnet-5", contextWindow: 200_000 },
      "execute",
    ),
  ).resolves.toEqual({ rebuilt: false, preTokens: null });
});
