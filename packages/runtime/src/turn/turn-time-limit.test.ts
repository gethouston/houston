import { existsSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { join } from "node:path";
import type { WireFrame } from "@houston/runtime-client";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
} from "../store/conversation-file";
import {
  fakePoolStore,
  HEARTBEAT_URL,
  POOL_STORE_URL,
} from "./pool-store.test-support";
import { createTurnServer } from "./server";

const servers: Server[] = [];
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

async function runWindDown(
  fence = false,
  empty = false,
  previousAttempt = false,
) {
  const pool = fakePoolStore("ws/org/agent");
  roots.push(pool.root);
  pool.put("workspaces/W/A/CLAUDE.md", "You help.");
  let stopped = false;
  let beatsAfterStop = 0;
  let stoppedOnce = false;
  let turnRoot = "";
  const order: string[] = [];
  const server = createTurnServer({
    token: "",
    store: new LocalDirStore(pool.root),
    poolStoreUrl: POOL_STORE_URL,
    heartbeatIntervalMs: 5,
    fetchImpl: async (input, init) => {
      if (String(input) === HEARTBEAT_URL) {
        if (!stopped) return new Response(null, { status: 204 });
        beatsAfterStop++;
        if (fence && stoppedOnce) return new Response(null, { status: 409 });
        stoppedOnce = true;
        return Response.json({ mode: "execute", stop: "turn_time_limit" });
      }
      const response = await pool.fetchImpl(input, init);
      if (init?.method === "PUT")
        order.push(
          String(input).includes("/transcripts/") ? "publish" : "sync",
        );
      return response;
    },
    removeTurnRoot: async (root) => {
      order.push("release");
      await rmSync(root, { recursive: true, force: true });
    },
    runTurn: async (fs, turn) => {
      turnRoot = fs.turnRoot;
      const dir = join(fs.dataDir, "conversations");
      if (previousAttempt) {
        appendUserMessageAt(dir, turn.conversationId, "earlier attempt", {
          turnId: turn.turnId,
        });
        appendAssistantMessageAt(dir, turn.conversationId, "earlier partial", {
          turnId: turn.turnId,
        });
      }
      appendUserMessageAt(dir, turn.conversationId, turn.text, {
        turnId: turn.turnId,
      });
      if (!empty)
        turn.emit({
          type: "text",
          data: "Saved progress",
          turnId: turn.turnId,
        });
      writeFileSync(join(fs.workspaceDir, "result.txt"), "work survives");
      stopped = true;
      await vi.waitFor(() => expect(turn.signal?.aborted).toBe(true), {
        timeout: 500,
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (!empty)
        appendAssistantMessageAt(dir, turn.conversationId, "Saved progress", {
          turnId: turn.turnId,
        });
      return { stopReason: turn.stopReason?.() };
    },
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  const response = await fetch(`http://127.0.0.1:${addr.port}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "org",
      agentId: "agent",
      conversationId: "c",
      turnId: "t",
      text: "work",
      gcsPrefix: "ws/org/agent",
      hostToken: "host",
      credential: {
        provider: "openai-codex",
        access: "access",
        expires: Date.now() + 60_000,
      },
      claim: {
        id: "claim",
        token: "token",
        bootId: "boot",
        heartbeatUrl: HEARTBEAT_URL,
      },
    }),
  });
  const raw = await response.text();
  const frames: WireFrame[] = raw
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
  return { pool, frames, order, beatsAfterStop, turnRoot };
}

test.each([
  false,
  true,
])("time-limit wind-down syncs, publishes the marker, emits one terminal and releases (empty=%s)", async (empty) => {
  const { pool, frames, order, beatsAfterStop, turnRoot } = await runWindDown(
    false,
    empty,
  );
  expect(frames.filter((f) => f.type === "done" || f.type === "error")).toEqual(
    [
      expect.objectContaining({
        type: "error",
        data: expect.objectContaining({
          code: "turn_time_limit",
          message:
            "This reply reached the 4-hour limit for one turn. Say continue and the agent picks up from what it saved.",
        }),
      }),
    ],
  );
  expect(pool.read("workspaces/W/A/result.txt")).toBe("work survives");
  expect(
    pool.read("workspaces/W/A/.houston/runtime/conversations/c.json"),
  ).toContain('"stopReason":"turn_time_limit"');
  const assistant = pool.transcripts.find((call) =>
    call.path.endsWith("/assistant"),
  );
  expect(JSON.parse(assistant?.body ?? "null")).toMatchObject({
    message: {
      role: "assistant",
      stopReason: "turn_time_limit",
      content: empty ? "" : "Saved progress",
    },
  });
  expect(order.indexOf("sync")).toBeLessThan(order.indexOf("publish"));
  expect(order.at(-1)).toBe("release");
  expect(beatsAfterStop).toBeGreaterThan(1);
  expect(existsSync(turnRoot)).toBe(false);
});

test("a 409 after the stop still fences instead of publishing saved progress", async () => {
  const { frames, pool } = await runWindDown(true);
  expect(frames.filter((f) => f.type === "done" || f.type === "error")).toEqual(
    [
      expect.objectContaining({
        type: "error",
        data: expect.objectContaining({ message: "claim_fenced" }),
      }),
    ],
  );
  expect(pool.transcripts).toHaveLength(0);
  expect(pool.writes).toHaveLength(0);
});

test("an empty adopted attempt publishes its own time-limit row after its user, leaving the older partial alone", async () => {
  const { pool } = await runWindDown(false, true, true);
  const assistant = pool.transcripts.find((call) =>
    call.path.endsWith("/assistant"),
  );
  expect(JSON.parse(assistant?.body ?? "null")).toMatchObject({
    message: {
      role: "assistant",
      content: "",
      turnId: "t",
      stopReason: "turn_time_limit",
    },
  });
  const stored = JSON.parse(
    pool.read("workspaces/W/A/.houston/runtime/conversations/c.json"),
  );
  expect(stored.messages[1]).toMatchObject({ content: "earlier partial" });
  expect(stored.messages[1].stopReason).toBeUndefined();
});
