import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRoutine } from "@houston/domain";
import type { ChatMessage } from "@houston/runtime-client";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import { createCompactionCheckpoints } from "../store/conversation-compaction";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
  type StoredConversation,
} from "../store/conversation-file";
import { createTurnServer } from "./server";
import type { TurnServerDeps } from "./server-types";
import type { TurnRunner } from "./turn-session";

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
  const runTurn: TurnRunner = async (filesystem, turn) => {
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

test("a compacted turn publishes its own final record, with the boundary the marker holds", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  let failure: ChatMessage | undefined;
  const runTurn: TurnRunner = async (filesystem, turn) => {
    const conversationsDir = join(filesystem.dataDir, "conversations");
    appendUserMessageAt(conversationsDir, turn.conversationId, turn.text, {
      turnId: turn.turnId,
    });
    createCompactionCheckpoints(conversationsDir).save(
      turn.conversationId,
      "Summary of the chat so far",
    );
    failure = appendAssistantMessageAt(
      conversationsDir,
      turn.conversationId,
      "",
      {
        turnId: turn.turnId,
        compaction: { trigger: "proactive", pre_tokens: 180_000 },
        providerError: {
          kind: "rate_limited",
          provider: "anthropic",
          model: "claude-opus-5",
          retry_after_seconds: 30,
          message: "429",
        },
      },
    )?.message;
    return {};
  };

  await runClaimedTurn({
    runTurn,
    poolStoreUrl: "https://pool.example/",
    fetchImpl: poolFetch(objects, requests),
    heartbeatIntervalMs: 60_000,
  });

  expect(failure?.providerError?.kind).toBe("rate_limited");
  expect(failure?.compaction).toBeUndefined();
  expect(requests[1]?.url).toContain("/turns/turn.7/assistant");
  expect(requests[1]?.body).toEqual({
    message: {
      ...failure,
      compaction: { trigger: "proactive", pre_tokens: 180_000 },
    },
    ts: failure?.ts,
  });
});

test("a transcript 404 disables publication for the turn without failing it", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  const runTurn: TurnRunner = async (filesystem, turn) => {
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
  const runTurn: TurnRunner = async (filesystem, turn) => {
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
  const runTurn: TurnRunner = async (filesystem, turn) => {
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

  expect(requests).toHaveLength(3);
  expect(raw).toContain('"type":"error"');
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
  const runTurn: TurnRunner = async (filesystem, turn) => {
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
  const runTurn: TurnRunner = async (filesystem, turn) => {
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
  const runTurn: TurnRunner = async (filesystem, turn) => {
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
  const runTurn: TurnRunner = async (filesystem, turn) => {
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

test("the user row lands on the user frame, before the turn finishes", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  let requestsWhenTurnEnded = -1;
  const runTurn: TurnRunner = async (filesystem, turn) => {
    const conversationsDir = join(filesystem.dataDir, "conversations");
    const { message } = appendUserMessageAt(
      conversationsDir,
      turn.conversationId,
      turn.text,
      { turnId: turn.turnId },
    );
    turn.emit({ type: "user", data: message, turnId: turn.turnId });
    await new Promise((resolve) => setTimeout(resolve, 50));
    requestsWhenTurnEnded = requests.length;
    appendAssistantMessageAt(conversationsDir, turn.conversationId, "Reply", {
      turnId: turn.turnId,
    });
    return {};
  };

  const raw = await runClaimedTurn({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, requests),
    heartbeatIntervalMs: 60_000,
  });

  expect(requestsWhenTurnEnded).toBe(1);
  expect(requests.map((r) => r.url.split("/").at(-1))).toEqual([
    "user",
    "assistant",
  ]);
  expect(raw).toContain('"type":"done"');
});

function errorMessage(raw: string): string | undefined {
  const frame = raw
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map(
      (line) =>
        JSON.parse(line.slice(6)) as {
          type: string;
          data: { message?: string } | null;
        },
    )
    .find((parsed) => parsed.type === "error");
  return frame?.data?.message;
}

const NO_PROVIDER = "No provider connected. Connect your subscription first.";

test.each([
  { name: "a fresh conversation", conversationId: "routine.run.1" },
  { name: "an existing conversation", conversationId: "mission.1" },
  {
    name: "a conversation holding an earlier attempt's user message",
    conversationId: "mission.1",
    earlierAttempt: true,
  },
])("an unconnected turn publishes no transcript, in $name", async ({
  conversationId,
  earlierAttempt,
}) => {
  const objects = seedStandingLayout();
  if (earlierAttempt) {
    const conversation: StoredConversation = {
      ...priorConversation,
      messages: [
        ...priorConversation.messages,
        {
          role: "user",
          content: "Build the launch plan",
          ts: 3,
          turnId: "turn.7",
        },
      ],
    };
    objects.set(
      "workspaces/Main/Helper/.houston/runtime/conversations/mission.1.json",
      new TextEncoder().encode(JSON.stringify(conversation)),
    );
  }
  const requests: TranscriptRequest[] = [];
  const raw = await runClaimedTurn(
    {
      runTurn: async () => {
        throw new Error("an unconnected turn must not run the session");
      },
      poolStoreUrl: "https://pool.example",
      fetchImpl: poolFetch(objects, requests),
      heartbeatIntervalMs: 60_000,
    },
    turnBody({ credential: null, conversationId }),
  );

  expect(requests).toHaveLength(0);
  expect(raw).toContain('"type":"user"');
  expect(errorMessage(raw)).toBe(NO_PROVIDER);
});

test("a credentialed turn that fails after persisting still publishes its user row", async () => {
  const objects = seedStandingLayout();
  const requests: TranscriptRequest[] = [];
  const runTurn: TurnRunner = async (filesystem, turn) => {
    const { message } = appendUserMessageAt(
      join(filesystem.dataDir, "conversations"),
      turn.conversationId,
      turn.text,
      { turnId: turn.turnId },
    );
    turn.emit({ type: "user", data: message, turnId: turn.turnId });
    return { error: "provider exploded" };
  };

  const raw = await runClaimedTurn({
    runTurn,
    poolStoreUrl: "https://pool.example",
    fetchImpl: poolFetch(objects, requests),
    heartbeatIntervalMs: 60_000,
  });

  expect(requests.map((r) => r.url.split("/").at(-1))).toEqual(["user"]);
  expect(errorMessage(raw)).toBe("provider exploded");
});

test("an unconnected routine run ends on the no-provider message alone", async () => {
  const objects = seedStandingLayout();
  const routine = createRoutine(
    {
      name: "Digest",
      prompt: "Summarize the inbox",
      schedule: "0 9 * * *",
      chat_mode: "per_run",
      provider: "openai-codex",
    },
    "r1",
    "2026-09-29T10:00:00.000Z",
  );
  objects.set(
    "workspaces/Main/Helper/.houston/routines/routines.json",
    new TextEncoder().encode(JSON.stringify([routine])),
  );
  const requests: TranscriptRequest[] = [];
  const pool = poolFetch(objects, requests);
  const docs = new Map<string, unknown>();
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (!new URL(url).pathname.startsWith("/v1/pod/docs/"))
      return pool(input, init);
    if (init?.method !== "PUT") {
      const doc = docs.get(url);
      return doc === undefined
        ? Response.json({ error: "document not found" }, { status: 404 })
        : Response.json({ doc, revision: 1 });
    }
    const { doc } = JSON.parse(String(init.body)) as { doc: unknown };
    docs.set(url, doc);
    return Response.json({ doc, revision: 1 });
  };
  const raw = await runClaimedTurn(
    {
      runTurn: async () => {
        throw new Error("an unconnected turn must not run the session");
      },
      poolStoreUrl: "https://pool.example",
      fetchImpl,
      heartbeatIntervalMs: 60_000,
    },
    turnBody({
      credential: null,
      text: "",
      routine: { id: "r1" },
      conversationId: "routine-r1-turn.7",
    }),
  );

  expect(requests).toHaveLength(0);
  const rows = [...docs.values()].flat() as { id: string }[];
  expect(rows.findLast((r) => r.id === "turn.7")).toMatchObject({
    status: "error",
    failure: { code: "creator_not_connected", provider: "openai-codex" },
  });
  expect(errorMessage(raw)).toBe(NO_PROVIDER);
});
