import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatMessage } from "@houston/runtime-client";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
  type StoredConversation,
} from "../store/conversation-file";
import { createTurnServer } from "./server";
import type { TurnServerDeps } from "./server-types";
import type { runPiTurn } from "./turn-session";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return `http://127.0.0.1:${address.port}`;
}

interface TranscriptRequest {
  body: Record<string, unknown>;
  headers: Headers;
  method: string;
  syncedMessageCount?: number;
  url: string;
}

function poolFetch(
  objects: Map<string, Uint8Array>,
  transcripts: TranscriptRequest[],
  transcriptStatuses: number[] = [],
): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/heartbeat") {
      return new Response(null, { status: 200 });
    }
    if (url.pathname.includes("/v1/pod/transcripts/")) {
      const status = transcriptStatuses[transcripts.length] ?? 200;
      const conversation = objects.get(
        "workspaces/Main/Helper/.houston/runtime/conversations/mission.1.json",
      );
      transcripts.push({
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        headers: new Headers(init?.headers),
        method: init?.method ?? "GET",
        syncedMessageCount: conversation
          ? (
              JSON.parse(
                new TextDecoder().decode(conversation),
              ) as StoredConversation
            ).messages.length
          : undefined,
        url: String(input),
      });
      return new Response(status === 503 ? "unavailable" : null, { status });
    }
    if (url.pathname.endsWith("/manifest")) {
      return Response.json({
        objects: [...objects].map(([key, bytes]) => ({
          key,
          size: bytes.byteLength,
          md5: "test",
          updated: "2026-08-18T00:00:00Z",
        })),
      });
    }
    const marker = "/objects/";
    const key = url.pathname
      .slice(url.pathname.indexOf(marker) + marker.length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    if (init?.method === "PUT") {
      const bytes = new Uint8Array(init.body as Uint8Array);
      objects.set(key, bytes);
      return Response.json({
        key,
        size: bytes.byteLength,
        md5: "test",
        updated: "2026-08-18T00:00:00Z",
      });
    }
    const bytes = objects.get(key);
    return bytes
      ? new Response(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
        )
      : new Response("missing", { status: 404 });
  };
}

const priorConversation: StoredConversation = {
  id: "mission.1",
  title: "Quarterly roadmap",
  createdAt: 1,
  updatedAt: 2,
  messages: [
    { role: "user", content: "Earlier", ts: 1 },
    { role: "assistant", content: "Earlier reply", ts: 2 },
  ],
};

function seedStandingLayout(): Map<string, Uint8Array> {
  const encode = (value: string) => new TextEncoder().encode(value);
  return new Map([
    ["workspaces/Main/Helper/.houston/runtime/settings.json", encode("{}")],
    [
      "workspaces/Main/Helper/.houston/runtime/conversations/mission.1.json",
      encode(JSON.stringify(priorConversation)),
    ],
  ]);
}

function localStandingStore(): LocalDirStore {
  const root = mkdtempSync(join(tmpdir(), "standing-store-"));
  const settings = join(
    root,
    "ws/acme.org/helper.bot/workspaces/Main/Helper/.houston/runtime/settings.json",
  );
  mkdirSync(join(settings, ".."), { recursive: true });
  writeFileSync(settings, "{}");
  return new LocalDirStore(root);
}

function turnBody(extra: Record<string, unknown> = {}) {
  return {
    workspaceId: "acme.org",
    agentId: "helper.bot",
    conversationId: "mission.1",
    text: "Build the launch plan",
    gcsPrefix: "ws/acme.org/helper.bot",
    credential: {
      provider: "openai-codex",
      access: "access-token",
      expires: Date.now() + 60_000,
    },
    turnId: "turn.7",
    hostToken: "host-token",
    claim: {
      id: "claim-1",
      bootId: "boot-1",
      token: "claim-token",
      heartbeatUrl: "https://pool.example/heartbeat",
    },
    ...extra,
  };
}

async function runClaimedTurn(
  deps: Partial<TurnServerDeps>,
  body = turnBody(),
): Promise<string> {
  const server = createTurnServer({
    store: new LocalDirStore(mkdtempSync(join(tmpdir(), "fallback-store-"))),
    token: "",
    // Transient statuses retry; keep the test fast and the attempt count exact.
    transcriptRetryDelaysMs: [0, 0],
    ...deps,
  });
  const base = await listen(server);
  const response = await fetch(`${base}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.text();
}

test("claimed turn publishes its persisted user and assistant before done", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  let userMessage: ChatMessage | undefined;
  let assistantMessage: ChatMessage | undefined;
  const runTurn: typeof runPiTurn = async (filesystem, turn) => {
    const conversationsDir = join(filesystem.dataDir, "conversations");
    userMessage = appendUserMessageAt(
      conversationsDir,
      turn.conversationId,
      turn.text,
      { turnId: turn.turnId },
    ).message;
    assistantMessage = appendAssistantMessageAt(
      conversationsDir,
      turn.conversationId,
      "Launch plan ready",
      { turnId: turn.turnId },
    )?.message;
    return {};
  };

  const raw = await runClaimedTurn({
    runTurn,
    poolStoreUrl: "https://pool.example/",
    fetchImpl: poolFetch(objects, requests),
    heartbeatIntervalMs: 60_000,
  });

  expect(requests.map(({ method, url }) => ({ method, url }))).toEqual([
    {
      method: "PUT",
      url: "https://pool.example/v1/pod/transcripts/acme.org/helper.bot/conversations/mission.1/turns/turn.7/user",
    },
    {
      method: "PUT",
      url: "https://pool.example/v1/pod/transcripts/acme.org/helper.bot/conversations/mission.1/turns/turn.7/assistant",
    },
  ]);
  expect(requests[0]?.headers.get("authorization")).toBe("Bearer host-token");
  expect(requests[0]?.headers.get("x-houston-claim-token")).toBe("claim-token");
  expect(requests[0]?.headers.get("x-houston-claim-boot")).toBe("boot-1");
  expect(requests[0]?.syncedMessageCount).toBe(4);
  expect(requests[0]?.body).toEqual({
    message: userMessage,
    ts: userMessage?.ts,
    title: "Quarterly roadmap",
    expectedCount: 2,
  });
  expect(requests[1]?.body).toEqual({
    message: assistantMessage,
    ts: assistantMessage?.ts,
  });
  expect(raw).toContain('"type":"done"');
  expect(raw).not.toContain('"type":"error"');
});

test("a transcript 404 disables publication for the turn without failing it", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem, turn) => {
    const conversationsDir = join(filesystem.dataDir, "conversations");
    appendUserMessageAt(conversationsDir, turn.conversationId, turn.text, {
      turnId: turn.turnId,
    });
    appendAssistantMessageAt(
      conversationsDir,
      turn.conversationId,
      "Launch plan ready",
      { turnId: turn.turnId },
    );
    return {};
  };

  const raw = await runClaimedTurn({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, requests, [404]),
    heartbeatIntervalMs: 60_000,
  });

  expect(requests).toHaveLength(1);
  expect(requests[0]?.url).toMatch(/\/user$/);
  expect(raw).toContain('"type":"done"');
  expect(raw).toContain('"transcriptSkipped":"route_absent"');
  expect(raw).not.toContain('"type":"error"');
});

test("a transcript 409 fences the claimed turn", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem, turn) => {
    const conversationsDir = join(filesystem.dataDir, "conversations");
    appendUserMessageAt(conversationsDir, turn.conversationId, turn.text, {
      turnId: turn.turnId,
    });
    appendAssistantMessageAt(conversationsDir, turn.conversationId, "Reply", {
      turnId: turn.turnId,
    });
    return {};
  };

  const raw = await runClaimedTurn({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, requests, [409]),
    heartbeatIntervalMs: 60_000,
  });

  expect(requests).toHaveLength(1);
  expect(raw).toContain('"type":"error"');
  expect(raw).toContain("claim_fenced");
  expect(raw).not.toContain('"type":"done"');
});

test("a transcript 503 becomes part of the terminal error", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem, turn) => {
    const conversationsDir = join(filesystem.dataDir, "conversations");
    appendUserMessageAt(conversationsDir, turn.conversationId, turn.text, {
      turnId: turn.turnId,
    });
    appendAssistantMessageAt(conversationsDir, turn.conversationId, "Reply", {
      turnId: turn.turnId,
    });
    return {};
  };

  const raw = await runClaimedTurn({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, requests, [503, 503, 503]),
    heartbeatIntervalMs: 60_000,
  });

  // Three attempts (two retries) on a transient 503, then the real answer.
  expect(requests).toHaveLength(3);
  expect(raw).toContain('"type":"error"');
  // Status only, never the response body: that text reaches the client and
  // the turn log.
  expect(raw).toContain("transcript publish failed: user row rejected (503)");
  expect(raw).not.toContain("unavailable");
  expect(raw).not.toContain('"type":"done"');
});

test("a transcript network failure becomes part of the terminal error", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  const backingFetch = poolFetch(objects, requests);
  const fetchImpl: typeof fetch = async (input, init) => {
    if (String(input).includes("/v1/pod/transcripts/")) {
      throw new Error("socket closed");
    }
    return backingFetch(input, init);
  };
  const runTurn: typeof runPiTurn = async (filesystem, turn) => {
    appendUserMessageAt(
      join(filesystem.dataDir, "conversations"),
      turn.conversationId,
      turn.text,
      { turnId: turn.turnId },
    );
    return {};
  };

  const raw = await runClaimedTurn({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl,
    heartbeatIntervalMs: 60_000,
  });

  expect(raw).toContain("transcript publish failed: socket closed");
  expect(raw).not.toContain('"type":"done"');
});

test("a turn without an assistant message publishes only its user row", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem, turn) => {
    appendUserMessageAt(
      join(filesystem.dataDir, "conversations"),
      turn.conversationId,
      turn.text,
      { turnId: turn.turnId },
    );
    return {};
  };

  const raw = await runClaimedTurn({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, requests),
    heartbeatIntervalMs: 60_000,
  });

  expect(requests).toHaveLength(1);
  expect(requests[0]?.url).toMatch(/\/user$/);
  expect(raw).toContain('"type":"done"');
});

test("an unclaimed turn makes no transcript requests", async () => {
  const requests: TranscriptRequest[] = [];
  const raw = await runClaimedTurn(
    {
      store: localStandingStore(),
      runTurn: async () => ({}),
      poolStoreUrl: "https://pool.example",
      fetchImpl: poolFetch(new Map(), requests),
    },
    turnBody({ hostToken: undefined, claim: undefined }),
  );

  expect(requests).toHaveLength(0);
  expect(raw).toContain('"type":"done"');
});

test("a shadow turn makes no transcript requests", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  const raw = await runClaimedTurn(
    {
      runTurn: async () => {
        throw new Error("shadow must not run the turn session");
      },
      poolStoreUrl: "https://pool.example",
      fetchImpl: poolFetch(objects, requests),
      heartbeatIntervalMs: 60_000,
    },
    turnBody({ shadow: true }),
  );

  expect(requests).toHaveLength(0);
  expect(raw).toContain('"type":"done"');
});

test("an assistant 404 after a landed user row is a failure, not deploy skew", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem, turn) => {
    const conversationsDir = join(filesystem.dataDir, "conversations");
    appendUserMessageAt(conversationsDir, turn.conversationId, turn.text, {
      turnId: turn.turnId,
    });
    appendAssistantMessageAt(conversationsDir, turn.conversationId, "Reply", {
      turnId: turn.turnId,
    });
    return {};
  };

  const raw = await runClaimedTurn({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, requests, [200, 404]),
    heartbeatIntervalMs: 60_000,
  });

  expect(requests).toHaveLength(2);
  expect(raw).toContain('"type":"error"');
  expect(raw).toContain(
    "transcript publish failed: assistant row rejected (404)",
  );
  expect(raw).not.toContain('"type":"done"');
});

test("a corrupt conversation file still ends in a terminal error frame", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  const runTurn: typeof runPiTurn = async (filesystem, turn) => {
    // The turn "ran" but left the conversation file unparseable.
    writeFileSync(
      join(filesystem.dataDir, "conversations", `${turn.conversationId}.json`),
      "{not json",
    );
    return {};
  };

  const raw = await runClaimedTurn({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, requests, []),
    heartbeatIntervalMs: 60_000,
  });

  expect(requests).toHaveLength(0);
  expect(raw).toContain('"type":"error"');
  expect(raw).toContain("transcript publish failed");
  expect(raw).not.toContain('"type":"done"');
});
