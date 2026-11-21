import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { vi } from "vitest";
import {
  fakePoolStore,
  HEARTBEAT_URL,
  POOL_STORE_URL,
} from "./pool-store.test-support";
import { createTurnServer } from "./server";
import type { TurnRunner } from "./turn-session";

export const AGENT = "workspaces/Personal/Probe";
export const RUNTIME = `${AGENT}/.houston/runtime`;
export const OWNER = "member-owner";
export const OTHER = "member-other";

const servers: Server[] = [];
export function closeTurnServers() {
  for (const server of servers.splice(0)) server.close();
}

export const cardConversation = (id: string) =>
  JSON.stringify({
    id,
    title: "Chat",
    createdAt: 1,
    updatedAt: 2,
    messages: [
      {
        role: "user",
        content: "send it",
        ts: 1,
        turnId: "t1",
        author: { userId: OWNER },
      },
      {
        role: "assistant",
        content: "",
        ts: 2,
        turnId: "t1",
        pendingInteraction: {
          steps: [{ kind: "question", id: "q1", question: "Send it?" }],
        },
      },
    ],
  });

const noCardConversation = (id: string) =>
  JSON.stringify({
    ...JSON.parse(cardConversation(id)),
    messages: JSON.parse(cardConversation(id)).messages.slice(0, 1),
  });

async function prefetchOf(
  pool: ReturnType<typeof fakePoolStore>,
  skip: readonly string[] = [],
  generation = "1",
) {
  const base = `${POOL_STORE_URL}/v1/pod/store/org/agent`;
  const { objects: manifest } = (await (
    await pool.fetchImpl(`${base}/manifest`)
  ).json()) as { objects: { key: string }[] };
  const objects: Record<string, { data: string; generation: string }> = {};
  for (const { key } of manifest)
    if (!skip.includes(key))
      objects[key] = {
        data: Buffer.from(pool.read(key)).toString("base64"),
        generation,
      };
  return { manifest, objects };
}

export interface PooledTurnOptions {
  stalePrefetch?: boolean;
  currentPrefetch?: boolean;
  prefetchBeforeConversation?: boolean;
  conversationNotInlined?: boolean;
  storeGeneration?: string;
  failRead?: number;
  failHydration?: number;
  inlinedGeneration?: string;
  failLive?: string;
  hangReread?: boolean;
  holdLive?: string;
}

export async function pooledTurn(
  conversationId: string,
  extra: Record<string, unknown>,
  seed: (put: (rel: string, content: string) => void) => void = () => {},
  options: PooledTurnOptions = {},
) {
  const pool = fakePoolStore("ws/org/agent");
  pool.put(`${AGENT}/CLAUDE.md`, "# Probe\n");
  pool.put(`${AGENT}/.houston/activity/activity.json`, "[]");
  const conversationKey = `${RUNTIME}/conversations/${conversationId}.json`;
  const skip = [
    ...(options.conversationNotInlined ? [conversationKey] : []),
    ...(options.holdLive ? [options.holdLive] : []),
    ...(options.failLive ? [options.failLive] : []),
  ];
  const generation = options.inlinedGeneration;
  let prefetch: unknown;
  if (options.prefetchBeforeConversation) prefetch = await prefetchOf(pool);
  if (options.stalePrefetch) {
    pool.put(conversationKey, noCardConversation(conversationId));
    prefetch = await prefetchOf(pool, skip, generation);
  }
  pool.put(conversationKey, cardConversation(conversationId));
  seed(pool.put);
  if (options.currentPrefetch)
    prefetch = await prefetchOf(pool, skip, generation);
  const turnlog: string[] = [];
  const reads = { full: 0, notModified: 0 };
  const order: string[] = [];
  let liveHeld = false;
  let reread: () => void = () => {};
  const rereadSeen = new Promise<void>((resolve) => {
    reread = resolve;
  });
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    if (String(input).includes("/v1/pod/turnlog/")) {
      turnlog.push(String(init?.body));
      return new Response(null, { status: 204 });
    }
    const path = decodeURIComponent(new URL(String(input)).pathname);
    if (options.failHydration && path.endsWith(`/objects/${AGENT}/CLAUDE.md`))
      return new Response("denied", { status: options.failHydration });
    if (options.failLive && path.endsWith(`/objects/${options.failLive}`))
      return new Response("denied", { status: 403 });
    if (
      options.holdLive &&
      !liveHeld &&
      path.endsWith(`/objects/${options.holdLive}`)
    ) {
      liveHeld = true;
      await Promise.race([
        rereadSeen,
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
      order.push("held-read-answered");
    }
    if (
      (init?.method ?? "GET") === "GET" &&
      path.endsWith(`/objects/${conversationKey}`)
    ) {
      if (options.failRead)
        return new Response("denied", { status: options.failRead });
      const generation = options.storeGeneration ?? "1";
      const condition = new Headers(init?.headers).get(
        "X-Houston-If-Generation-Not-Match",
      );
      if (condition !== null) {
        order.push("conversation-reread");
        reread();
      }
      if (condition !== null && options.hangReread)
        return new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          ),
        );
      if (condition === generation) {
        reads.notModified++;
        return new Response(null, { status: 304 });
      }
      reads.full++;
      const live = await pool.fetchImpl(input as string, init);
      return new Response(await live.arrayBuffer(), {
        status: live.status,
        headers: { "X-Houston-Generation": generation },
      });
    }
    return pool.fetchImpl(input as string, init);
  }) as typeof fetch;
  const runTurn = vi.fn<TurnRunner>(async () => ({}));
  const server = createTurnServer({
    store: new LocalDirStore(pool.root),
    token: "",
    runTurn,
    poolStoreUrl: POOL_STORE_URL,
    turnLogUrl: "https://gateway.test",
    fetchImpl,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const res = await fetch(`http://127.0.0.1:${port}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceId: "org",
      agentId: "agent",
      conversationId,
      text: "yes",
      gcsPrefix: "ws/org/agent",
      credential: {
        provider: "openai-codex",
        access: "token",
        expires: Date.now() + 60_000,
      },
      hostToken: "host-token",
      claim: {
        id: "1",
        token: "1",
        bootId: "boot",
        heartbeatUrl: HEARTBEAT_URL,
      },
      ...(prefetch ? { prefetch } : {}),
      ...extra,
    }),
  });
  const text = await res.text();
  return { res, text, runTurn, turnlog, reads, order, pool, conversationKey };
}
