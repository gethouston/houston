import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { Conversation } from "./conversation-record";

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-csr-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-csr-ws-"),
);

const { switchBackendIfNeeded } = await import("./conversation-switch");

test("switching resolves a backend without conversation-cache being loaded", async () => {
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
