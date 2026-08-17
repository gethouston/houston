import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ChatMessage } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import { EnvCredentialVault } from "../credentials/vault";
import { MemoryWorkspaceStore } from "../store/memory";
import type {
  TranscriptShadow,
  TranscriptShadowCommand,
} from "../transcripts/http-shadow";
import { handleSandboxTranscripts } from "./transcripts-sandbox";

test("the sandbox facade authenticates and forwards the user turn verbatim", async () => {
  const store = new MemoryWorkspaceStore();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "A",
  });
  const vault = new EnvCredentialVault({ secret: "host-secret" });
  const commands: TranscriptShadowCommand[] = [];
  const transcriptShadow: TranscriptShadow = {
    async apply(command) {
      commands.push(command);
    },
    async replyAfter() {
      return null;
    },
  };
  const message: ChatMessage = { role: "user", content: "hello", ts: 12 };
  const req = Readable.from([
    Buffer.from(
      JSON.stringify({
        message,
        title: "hello",
        expectedCount: 3,
        // Legacy field a pre-cleanup runtime still sends: must be tolerated
        // (ignored), never required.
        needsSessionReplay: true,
      }),
    ),
  ]) as IncomingMessage;
  req.headers = {
    authorization: `Bearer ${vault.sandboxToken(workspace.id, agent.id)}`,
  };
  const response = responseRecorder();

  const handled = await handleSandboxTranscripts(
    { vault, transcriptShadow },
    "PUT",
    "/sandbox/transcripts/conversations/c1/turns/t1/user",
    new URL("http://host/sandbox/transcripts/conversations/c1/turns/t1/user"),
    req,
    response.res,
  );

  expect(handled).toBe(true);
  expect(response.status).toBe(202);
  expect(commands).toEqual([
    {
      kind: "user",
      conversationId: "c1",
      turnId: "t1",
      message,
      title: "hello",
      expectedCount: 3,
    },
  ]);
});

function responseRecorder() {
  const state = { status: 0 };
  const res = {
    writeHead: vi.fn((status: number) => {
      state.status = status;
      return res;
    }),
    end: vi.fn(),
  } as unknown as ServerResponse;
  return {
    res,
    get status() {
      return state.status;
    },
  };
}
