import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import {
  noteCodexRefusal,
  resetCodexRefusalMemory,
  resolveCodexTerseRefusal,
} from "../ai/codex-terse-refusal";
import { config } from "../config";
import { runWithConversationId } from "../session/conversation-context";
import {
  reconnectOfferedBefore,
  rememberReconnectOffered,
  resetReconnectOfferedMemory,
} from "../session/tools/integrations-reconnect-once";
import { prepareTurnFilesystem, syncTurnFilesystem } from "./turn-filesystem";
import { ownConversationOnly } from "./turn-hot-set";
import { resetPooledRoutineSession } from "./turn-routine-context";

const PREFIX = "ws/w1/agent-1";
const RUNTIME = "workspaces/Personal/Bob/.houston/runtime";
const GATE = {
  kind: "model_unavailable" as const,
  provider: "openai-codex",
  model: "gpt-5.4-mini",
  reason: "unknown" as const,
  suggested_fallback: null,
  message:
    "'gpt-5.4-mini' is not supported when using Codex with a ChatGPT account",
};

afterEach(() => {
  resetCodexRefusalMemory();
  resetReconnectOfferedMemory();
});

function seededStore(conversations: string[]): LocalDirStore {
  const storeRoot = mkdtempSync(join(tmpdir(), "marks-store-"));
  const runtime = join(storeRoot, PREFIX, ...RUNTIME.split("/"));
  mkdirSync(join(runtime, "conversations"), { recursive: true });
  for (const id of conversations)
    writeFileSync(join(runtime, "conversations", `${id}.json`), "{}");
  return new LocalDirStore(storeRoot);
}

async function sandboxTurn<T>(
  store: LocalDirStore,
  conversationId: string,
  body: (dataDir: string) => T,
): Promise<T> {
  const fs = await prepareTurnFilesystem({
    store,
    prefix: PREFIX,
    root: mkdtempSync(join(tmpdir(), "marks-root-")),
    claimed: true,
    filter: ownConversationOnly(conversationId),
  });
  const result = runWithConversationId(
    conversationId,
    () => body(fs.dataDir),
    fs.dataDir,
  );
  await syncTurnFilesystem({
    store,
    prefix: PREFIX,
    filesystem: fs,
    conversationId,
    claimed: true,
  });
  resetCodexRefusalMemory();
  resetReconnectOfferedMemory();
  return result;
}

const terse = () =>
  resolveCodexTerseRefusal({
    provider: "openai-codex",
    model: "gpt-5.4-mini",
    message: '{"detail":"Bad Request"}',
  });

test("a Codex refusal and a reconnect card reach the conversation's next sandbox", async () => {
  const store = seededStore(["c1", "c2"]);
  await sandboxTurn(store, "c1", () => {
    noteCodexRefusal(GATE);
    rememberReconnectOffered("gmail");
  });

  const next = await sandboxTurn(store, "c1", () => ({
    refusal: terse(),
    offered: reconnectOfferedBefore("gmail", undefined),
    otherApp: reconnectOfferedBefore("slack", undefined),
  }));
  expect(next.refusal?.kind).toBe("model_unavailable");
  expect(next.offered).toBe(true);
  expect(next.otherApp).toBe(false);

  const other = await sandboxTurn(store, "c2", () => ({
    refusal: terse(),
    offered: reconnectOfferedBefore("gmail", undefined),
  }));
  expect(other).toEqual({ refusal: null, offered: false });
});

test("a routine fire's fresh session keeps the conversation's marks", async () => {
  const id = "routine-daily";
  const store = seededStore([id]);
  await sandboxTurn(store, id, (dataDir) => {
    mkdirSync(join(dataDir, "sessions", id), { recursive: true });
    writeFileSync(join(dataDir, "sessions", id, "old.jsonl"), "{}\n");
    noteCodexRefusal(GATE);
    rememberReconnectOffered("gmail");
  });

  const fired = await sandboxTurn(store, id, (dataDir) => {
    expect(
      resetPooledRoutineSession({ dataDir, conversationId: id, fire: true }),
    ).toBe(true);
    return {
      pi: existsSync(join(dataDir, "sessions", id, "old.jsonl")),
      refusal: terse(),
      offered: reconnectOfferedBefore("gmail", undefined),
    };
  });
  expect(fired.pi).toBe(false);
  expect(fired.refusal?.kind).toBe("model_unavailable");
  expect(fired.offered).toBe(true);

  const after = await sandboxTurn(store, id, (dataDir) =>
    existsSync(join(dataDir, "sessions", id, "old.jsonl")),
  );
  expect(after).toBe(false);
});

test("a standing pod or desktop turn keeps both marks in memory and writes no file", () => {
  const prevDataDir = config.dataDir;
  config.dataDir = mkdtempSync(join(tmpdir(), "marks-standing-"));
  try {
    const seen = runWithConversationId("c1", () => {
      noteCodexRefusal(GATE);
      rememberReconnectOffered("gmail");
      return {
        refusal: terse(),
        offered: reconnectOfferedBefore("gmail", undefined),
      };
    });
    expect(seen.refusal?.kind).toBe("model_unavailable");
    expect(seen.offered).toBe(true);
    expect(existsSync(join(config.dataDir, "sessions"))).toBe(false);
  } finally {
    config.dataDir = prevDataDir;
  }
});
