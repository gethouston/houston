import type { ConversationSummary } from "@houston/runtime-client";
import { HoustonEngineClient } from "@houston/runtime-client";
import { describe, expect, it } from "vitest";
import { createAuthExpiryNotifier } from "../../auth-expiry";
import { CommandRegistry } from "../../commands";
import type { ModuleContext } from "../../module-context";
import type { SdkConfig } from "../../ports";
import { ScopeStore } from "../../store";
import { memoryKv } from "../../test-ports";
import {
  type ConversationListVM,
  conversationListScope,
  createConversationsModule,
} from "./index";

/**
 * The PRIMITIVE read, separate from the reactive loader that wraps it.
 *
 * `list` is the one member whose own body issues `GET /agents/<id>/conversations`,
 * which is what makes the route dispatchable — so what is pinned here is that it
 * touches the wire ONCE, leaves the store alone (no VM is published by a bare
 * read), and hands back the engine's rows unmapped. The second case is the
 * regression the split could have caused: `refresh` still publishes its VM and
 * still reads exactly once, not twice.
 */

const BASE = "http://engine.test";

interface RecordedCall {
  url: string;
  method: string;
}

/** A `fetch` stub serving one route: the agent's conversation list. */
function makeEngine(seed: Record<string, ConversationSummary[]>) {
  const db = new Map<string, ConversationSummary[]>(Object.entries(seed));
  const calls: RecordedCall[] = [];

  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method });

    const match = /^\/agents\/([^/]+)\/conversations$/.exec(
      new URL(url).pathname,
    );
    if (!match || method !== "GET")
      return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(db.get(decodeURIComponent(match[1]))), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

function makeCtx(fetchImpl: typeof fetch) {
  const store = new ScopeStore();
  const registry = new CommandRegistry();
  const config: SdkConfig = {
    baseUrl: BASE,
    ports: {
      fetch: fetchImpl,
      storage: memoryKv(),
      devicePreferences: memoryKv(),
      clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    },
  };
  const ctx: ModuleContext = {
    config,
    store,
    // The kernel's per-agent resolver: `${BASE}/agents/<id>` (empty id → base).
    clientFor: (agentId) =>
      new HoustonEngineClient({
        baseUrl: agentId
          ? `${BASE}/agents/${encodeURIComponent(agentId)}`
          : BASE,
        fetch: fetchImpl,
      }),
    authExpiry: createAuthExpiryNotifier(store),
    registerCommand: (type, handler) => registry.register(type, handler),
  };
  return { ctx, store };
}

const conv = (over: Partial<ConversationSummary>): ConversationSummary => ({
  id: "c1",
  title: "First",
  createdAt: 1,
  updatedAt: 2,
  ...over,
});

const snap = (store: ScopeStore, agentId: string) =>
  store.getSnapshot(conversationListScope(agentId)) as
    | ConversationListVM
    | undefined;

describe("conversations.list", () => {
  it("reads the agent's chats with exactly one GET", async () => {
    const { fetchImpl, calls } = makeEngine({ alice: [conv({})] });
    const { ctx } = makeCtx(fetchImpl);

    await createConversationsModule(ctx).list("alice");

    expect(calls).toEqual([
      { url: `${BASE}/agents/alice/conversations`, method: "GET" },
    ]);
  });

  it("returns the engine's summaries verbatim", async () => {
    const rows = [
      conv({ id: "c1", title: "First", lastMessage: "hi" }),
      conv({ id: "c2", title: "Second", createdAt: 3, updatedAt: 4 }),
    ];
    const { fetchImpl } = makeEngine({ alice: rows });
    const { ctx } = makeCtx(fetchImpl);

    await expect(createConversationsModule(ctx).list("alice")).resolves.toEqual(
      rows,
    );
  });

  it("publishes no scope: a bare read leaves the store untouched", async () => {
    const { fetchImpl } = makeEngine({ alice: [conv({})] });
    const { ctx, store } = makeCtx(fetchImpl);

    const seen: unknown[] = [];
    store.subscribe(conversationListScope("alice"), (s) => seen.push(s));

    await createConversationsModule(ctx).list("alice");

    expect(seen).toEqual([]);
    expect(snap(store, "alice")).toBeUndefined();
  });

  it("leaves refresh publishing its VM off a single read", async () => {
    const { fetchImpl, calls } = makeEngine({
      alice: [conv({ id: "c1", title: "First", lastMessage: "hi" })],
    });
    const { ctx, store } = makeCtx(fetchImpl);

    const vm = await createConversationsModule(ctx).refresh("alice");

    expect(vm).toEqual({
      loaded: true,
      items: [
        {
          id: "c1",
          title: "First",
          createdAt: 1,
          updatedAt: 2,
          lastMessage: "hi",
        },
      ],
    });
    expect(snap(store, "alice")).toEqual(vm);
    expect(calls).toEqual([
      { url: `${BASE}/agents/alice/conversations`, method: "GET" },
    ]);
  });
});
