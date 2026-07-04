import type { ConversationSummary } from "@houston/runtime-client";
import { HoustonEngineClient } from "@houston/runtime-client";
import { describe, expect, it, vi } from "vitest";
import { createAuthExpiryNotifier } from "../../auth-expiry";
import { CommandRegistry } from "../../commands";
import type { ModuleContext } from "../../module-context";
import type { SdkConfig } from "../../ports";
import { ScopeStore } from "../../store";
import {
  type ConversationListVM,
  conversationListScope,
  createConversationsModule,
} from "./index";

const BASE = "http://engine.test";

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

/**
 * A tiny in-memory engine keyed by agent id, exposed as a `fetch` stub. It
 * serves exactly the runtime-client conversation surface this module uses:
 *   GET    /agents/<id>/conversations
 *   PATCH  /agents/<id>/conversations/<cid>   { title }
 *   DELETE /agents/<id>/conversations/<cid>
 * Mutations update the backing store, so a refetch observes the new state —
 * this is what proves "refetch-after-mutation".
 */
function makeEngine(seed: Record<string, ConversationSummary[]>) {
  const db = new Map<string, ConversationSummary[]>(
    Object.entries(seed).map(([id, rows]) => [id, [...rows]]),
  );
  const calls: RecordedCall[] = [];

  const route = /\/agents\/([^/]+)\/conversations(?:\/([^/]+))?$/;

  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, method, body });

    const match = route.exec(new URL(url).pathname);
    if (!match) return new Response("not found", { status: 404 });
    const agentId = decodeURIComponent(match[1]);
    const convId = match[2] ? decodeURIComponent(match[2]) : undefined;
    const rows = db.get(agentId) ?? [];

    if (method === "GET" && !convId) return json(rows);
    if (method === "PATCH" && convId) {
      const row = rows.find((r) => r.id === convId);
      if (row) row.title = (body as { title: string }).title;
      return json({ ok: true });
    }
    if (method === "DELETE" && convId) {
      db.set(
        agentId,
        rows.filter((r) => r.id !== convId),
      );
      return json({ ok: true });
    }
    return new Response("method not allowed", { status: 405 });
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function makeCtx(fetchImpl: typeof fetch) {
  const store = new ScopeStore();
  const registry = new CommandRegistry();
  const config: SdkConfig = {
    baseUrl: BASE,
    ports: {
      fetch: fetchImpl,
      storage: {
        get: async () => null,
        set: async () => {},
        delete: async () => {},
      },
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
  return { ctx, store, registry };
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

describe("conversations module — list", () => {
  it("refresh fetches the agent's list and publishes a loaded VM", async () => {
    const { fetchImpl, calls } = makeEngine({
      alice: [
        conv({ id: "c1", title: "First", lastMessage: "hi" }),
        conv({ id: "c2", title: "Second", createdAt: 3, updatedAt: 4 }),
      ],
    });
    const { ctx, store } = makeCtx(fetchImpl);
    const mod = createConversationsModule(ctx);

    const vm = await mod.refresh("alice");

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
        { id: "c2", title: "Second", createdAt: 3, updatedAt: 4 },
      ],
    });
    // c2 has no lastMessage: the field must be absent, not `undefined`.
    expect("lastMessage" in vm.items[1]).toBe(false);
    expect(snap(store, "alice")).toEqual(vm);
    expect(calls[calls.length - 1].url).toBe(
      `${BASE}/agents/alice/conversations`,
    );
  });

  it("publishes a loading snapshot (loaded:false) before the loaded one", async () => {
    const { fetchImpl } = makeEngine({ alice: [conv({})] });
    const { ctx, store } = makeCtx(fetchImpl);
    const mod = createConversationsModule(ctx);

    const seen: boolean[] = [];
    store.subscribe(conversationListScope("alice"), (s) =>
      seen.push((s as ConversationListVM).loaded),
    );

    await mod.refresh("alice");
    expect(seen).toEqual([false, true]);
  });

  it("keeps prior items while a refresh is in flight", async () => {
    const { fetchImpl } = makeEngine({ alice: [conv({ id: "c1" })] });
    const { ctx, store } = makeCtx(fetchImpl);
    const mod = createConversationsModule(ctx);
    await mod.refresh("alice");

    const loadingItems: ConversationListVM[] = [];
    store.subscribe(conversationListScope("alice"), (s) => {
      const vm = s as ConversationListVM;
      if (!vm.loaded) loadingItems.push(vm);
    });
    await mod.refresh("alice");

    expect(loadingItems).toHaveLength(1);
    expect(loadingItems[0].items).toHaveLength(1);
  });
});

describe("conversations module — mutations refetch", () => {
  it("rename PATCHes then refetches, publishing the updated list", async () => {
    const { fetchImpl, calls } = makeEngine({
      alice: [conv({ id: "c1", title: "Old" })],
    });
    const { ctx, store } = makeCtx(fetchImpl);
    const mod = createConversationsModule(ctx);

    const vm = await mod.rename("alice", "c1", "New name");

    expect(vm.items[0].title).toBe("New name");
    expect(snap(store, "alice")?.items[0].title).toBe("New name");

    const methods = calls.map((c) => c.method);
    // PATCH first, then a GET refetch after the mutation.
    expect(methods).toEqual(["PATCH", "GET"]);
    expect(calls[0].url).toBe(`${BASE}/agents/alice/conversations/c1`);
    expect(calls[0].body).toEqual({ title: "New name" });
  });

  it("delete DELETEs then refetches, publishing the shrunken list", async () => {
    const { fetchImpl, calls } = makeEngine({
      alice: [conv({ id: "c1" }), conv({ id: "c2" })],
    });
    const { ctx, store } = makeCtx(fetchImpl);
    const mod = createConversationsModule(ctx);

    const vm = await mod.delete("alice", "c1");

    expect(vm.items.map((i) => i.id)).toEqual(["c2"]);
    expect(snap(store, "alice")?.items.map((i) => i.id)).toEqual(["c2"]);
    expect(calls.map((c) => c.method)).toEqual(["DELETE", "GET"]);
  });
});

/**
 * A `fetch` stub whose GET responses stay pending until the test resolves them
 * by hand — the tool for forcing two in-flight loads to settle OUT OF ORDER.
 * Each GET pushes a `{ url, resolve }` onto `pending`; calling `resolve(rows)`
 * fulfils that specific request with those conversation rows.
 */
function deferredEngine() {
  const pending: Array<{
    url: string;
    resolve: (rows: ConversationSummary[]) => void;
  }> = [];
  const fetchImpl = ((input: unknown) => {
    const url = String(input);
    return new Promise<Response>((resolvePromise) => {
      pending.push({ url, resolve: (rows) => resolvePromise(json(rows)) });
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, pending };
}

describe("conversations module — concurrent loads (last-intent-wins)", () => {
  it("drops a stale in-flight load whose response lands after a newer one", async () => {
    const { fetchImpl, pending } = deferredEngine();
    const { ctx, store } = makeCtx(fetchImpl);
    const mod = createConversationsModule(ctx);

    // Two loads issued back-to-back on the SAME agent — the shape of a
    // rename/delete (each ends in a load) racing a manual refresh.
    const first = mod.refresh("alice"); // issued first  → STALE intent
    const second = mod.refresh("alice"); // issued second → FRESH intent
    expect(pending).toHaveLength(2);

    // Responses settle OUT OF ORDER: the newer request resolves first, then the
    // older one lands late carrying pre-mutation rows.
    pending[1].resolve([conv({ id: "fresh", title: "Fresh" })]);
    pending[0].resolve([conv({ id: "stale", title: "Stale" })]);
    await Promise.all([first, second]);

    // The newest-issued intent must win; the late stale response is dropped and
    // never flushed over the fresh snapshot.
    expect(snap(store, "alice")?.items.map((i) => i.id)).toEqual(["fresh"]);
  });

  it("in-order responses still publish the latest load", async () => {
    const { fetchImpl, pending } = deferredEngine();
    const { ctx, store } = makeCtx(fetchImpl);
    const mod = createConversationsModule(ctx);

    const first = mod.refresh("alice");
    const second = mod.refresh("alice");
    // Natural order: older resolves first, newer second.
    pending[0].resolve([conv({ id: "old", title: "Old" })]);
    pending[1].resolve([conv({ id: "new", title: "New" })]);
    await Promise.all([first, second]);

    expect(snap(store, "alice")?.items.map((i) => i.id)).toEqual(["new"]);
  });

  it("a stale load on one agent does not suppress another agent's load", async () => {
    const { fetchImpl, pending } = deferredEngine();
    const { ctx, store } = makeCtx(fetchImpl);
    const mod = createConversationsModule(ctx);

    // Per-agent sequences are independent: alice's second load must not gate bob.
    const aliceFirst = mod.refresh("alice");
    const aliceSecond = mod.refresh("alice");
    const bob = mod.refresh("bob");

    pending.find((p) => p.url.includes("/bob/"))?.resolve([conv({ id: "b1" })]);
    const aliceCalls = pending.filter((p) => p.url.includes("/alice/"));
    aliceCalls[1].resolve([conv({ id: "a-fresh" })]);
    aliceCalls[0].resolve([conv({ id: "a-stale" })]);
    await Promise.all([aliceFirst, aliceSecond, bob]);

    expect(snap(store, "alice")?.items.map((i) => i.id)).toEqual(["a-fresh"]);
    expect(snap(store, "bob")?.items.map((i) => i.id)).toEqual(["b1"]);
  });
});

describe("conversations module — scope isolation", () => {
  it("two agents keep independent scopes and fetch their own URLs", async () => {
    const { fetchImpl, calls } = makeEngine({
      alice: [conv({ id: "a1", title: "Alice one" })],
      bob: [conv({ id: "b1", title: "Bob one" }), conv({ id: "b2" })],
    });
    const { ctx, store } = makeCtx(fetchImpl);
    const mod = createConversationsModule(ctx);

    await mod.refresh("alice");
    await mod.refresh("bob");

    expect(snap(store, "alice")?.items.map((i) => i.id)).toEqual(["a1"]);
    expect(snap(store, "bob")?.items.map((i) => i.id)).toEqual(["b1", "b2"]);

    const urls = calls.map((c) => c.url);
    expect(urls).toContain(`${BASE}/agents/alice/conversations`);
    expect(urls).toContain(`${BASE}/agents/bob/conversations`);

    // A delete on bob must not disturb alice's scope.
    await mod.delete("bob", "b1");
    expect(snap(store, "alice")?.items.map((i) => i.id)).toEqual(["a1"]);
    expect(snap(store, "bob")?.items.map((i) => i.id)).toEqual(["b2"]);
  });
});

describe("conversations module — bridge/command path", () => {
  it("registers exactly the three command types", () => {
    const { fetchImpl } = makeEngine({});
    const { ctx, registry } = makeCtx(fetchImpl);
    createConversationsModule(ctx);
    expect(registry.has("conversations/refresh")).toBe(true);
    expect(registry.has("conversations/rename")).toBe(true);
    expect(registry.has("conversations/delete")).toBe(true);
  });

  it("dispatch runs the same load path as the facade", async () => {
    const { fetchImpl } = makeEngine({ alice: [conv({ id: "c1" })] });
    const { ctx, store, registry } = makeCtx(fetchImpl);
    createConversationsModule(ctx);

    const result = await registry.dispatch({
      id: "r1",
      type: "conversations/refresh",
      payload: { agentId: "alice" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    const value = result.value as ConversationListVM;
    expect(value.items.map((i) => i.id)).toEqual(["c1"]);
    expect(snap(store, "alice")).toEqual(value);
  });

  it("a malformed payload resolves to ok:false, never a silent default", async () => {
    const { fetchImpl, calls } = makeEngine({ alice: [conv({})] });
    const { ctx, registry } = makeCtx(fetchImpl);
    createConversationsModule(ctx);

    const missingAgent = await registry.dispatch({
      id: "1",
      type: "conversations/refresh",
      payload: {},
    });
    const badPayload = await registry.dispatch({
      id: "2",
      type: "conversations/refresh",
      payload: null,
    });
    const missingTitle = await registry.dispatch({
      id: "3",
      type: "conversations/rename",
      payload: { agentId: "alice", id: "c1" },
    });

    expect(missingAgent.ok).toBe(false);
    expect(badPayload.ok).toBe(false);
    expect(missingTitle.ok).toBe(false);
    if (missingAgent.ok || badPayload.ok || missingTitle.ok) {
      throw new Error("expected failures");
    }
    expect(missingAgent.error.message).toMatch(/agentId/);
    expect(badPayload.error.message).toMatch(/payload must be an object/);
    expect(missingTitle.error.message).toMatch(/title/);
    // Nothing hit the network on a rejected payload.
    expect(calls).toHaveLength(0);
  });
});

describe("conversations module — facade surface", () => {
  it("exposes a scope helper matching the published scope", () => {
    const { fetchImpl } = makeEngine({});
    const { ctx } = makeCtx(fetchImpl);
    const mod = createConversationsModule(ctx);
    expect(mod.scope("alice")).toBe("conversations/alice");
  });

  it("surfaces an engine error from refresh (no swallow)", async () => {
    const failing = vi.fn(async () => new Response("boom", { status: 500 }));
    const { ctx } = makeCtx(failing as unknown as typeof fetch);
    const mod = createConversationsModule(ctx);
    await expect(mod.refresh("alice")).rejects.toThrow();
  });
});
