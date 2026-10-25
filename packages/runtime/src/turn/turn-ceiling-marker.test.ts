import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { expect, test, vi } from "vitest";
import { finishTurnDurability } from "./turn-durability";
import { prepareTurnFilesystem } from "./turn-filesystem";
import { durableTerminalFrame } from "./turn-terminal";
import { createTurnTranscript } from "./turn-transcript";
import type { TurnRequest } from "./types";

test.each([
  "missing",
  "corrupt",
])("a %s conversation reports the marker failure and still sends the coded terminal", async (state) => {
  const root = mkdtempSync(join(tmpdir(), "ceiling-marker-"));
  const store = new LocalDirStore(join(root, "store"));
  const filesystem = await prepareTurnFilesystem({
    store,
    prefix: "ws/w/a",
    root: join(root, "turn"),
    claimed: false,
  });
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    if (state === "corrupt") {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(filesystem.dataDir, "conversations"), { recursive: true });
      writeFileSync(
        join(filesystem.dataDir, "conversations/c.json"),
        "{bad-json",
      );
    }
    const turn = {
      workspaceId: "w",
      agentId: "a",
      text: "work",
      conversationId: "c",
      turnId: "t",
      credential: {
        provider: "openai-codex",
        access: "test",
        accountId: null,
        expires: Date.now() + 60000,
      },
      hostToken: "test",
      gcsPrefix: "ws/w/a",
      claim: {
        id: "claim",
        token: "test",
        bootId: "boot",
        heartbeatUrl: "https://store.example/hb",
      },
    } satisfies TurnRequest & { turnId: string };
    const deps = { token: "", store, poolStoreUrl: "https://store.example" };
    const durable = await finishTurnDurability({
      deps,
      turn,
      filesystem,
      resolved: { store, prefix: "ws/w/a" },
      heartbeat: null,
      outcome: { stopReason: "turn_time_limit" },
      transcript: createTurnTranscript(deps, turn, filesystem),
    });
    expect(
      durableTerminalFrame(
        durable,
        "t",
        {},
        { hydratedObjects: 0, skippedObjects: 0 },
      ),
    ).toMatchObject({
      type: "error",
      data: { code: "turn_time_limit_unsaved" },
    });
    expect(errors).toHaveBeenCalledWith(
      "[turn] wind-down marker failed",
      expect.any(Error),
    );
  } finally {
    errors.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
});
