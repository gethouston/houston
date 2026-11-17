import { LazyReadRefusedError } from "@houston/host/src/vfs";
import { describe, expect, test } from "vitest";
import { applyConversationOp } from "./op-conversation";
import { settleAbandonedChat } from "./op-reconcile-chat";
import type { TurnFilesystem } from "./turn-filesystem";

const CID = "c1";
const DATA_REL = "workspaces/P/Bob/.houston";

/** A lazy tree whose only chat refuses its read for `reason`. */
function refusingTree(reason: LazyReadRefusedError["reason"]): TurnFilesystem {
  const file = `${DATA_REL}/conversations/${CID}.json`;
  const vfs = {
    list: async () => [file],
    readBytes: async (key: string) => {
      throw new LazyReadRefusedError(reason, key, 10, 5);
    },
  };
  // Only the members these ops touch before the refused read.
  return {
    dataRel: DATA_REL,
    dataDir: "/nowhere/.houston",
    vfs,
  } as unknown as TurnFilesystem;
}

describe("a refused lazy read is named for why it was refused", () => {
  test.each(["object", "total"] as const)(
    "a %s refusal stays 'too large'",
    async (reason) => {
      const fs = refusingTree(reason);
      const conversation = await applyConversationOp(
        { kind: "conversation", action: "rename", conversationId: CID },
        fs,
      );
      expect(conversation.status).toBe(503);
      expect(JSON.parse(conversation.body)).toEqual({
        error: "conversation too large to edit asleep",
      });
      expect(
        await settleAbandonedChat(fs, CID, {
          turnId: "t1",
          startedAt: "2026-10-10T00:00:00Z",
          routine: false,
        }),
      ).toEqual({ tooLarge: true });
    },
  );

  test("a private refusal is never reported as too large", async () => {
    const fs = refusingTree("private");
    const conversation = await applyConversationOp(
      { kind: "conversation", action: "rename", conversationId: CID },
      fs,
    );
    expect(conversation.status).toBe(503);
    expect(conversation).toMatchObject({ decline: true });
    expect(JSON.parse(conversation.body)).toEqual({
      error: "conversation could not be read asleep",
      code: "private_state_refused",
    });
    expect(
      await settleAbandonedChat(fs, CID, {
        turnId: "t1",
        startedAt: "2026-10-10T00:00:00Z",
        routine: false,
      }),
    ).toEqual({ privateRefused: true });
  });
});
