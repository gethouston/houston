import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAuthExpiryNotifier,
  TOKEN_EXPIRED_EVENT,
} from "../../auth-expiry";
import type { ModuleContext } from "../../module-context";
import type { KeyValueStore, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { ScopeStore, type SdkEvent } from "../../store";
import {
  connectAuthExpiry,
  createAuthFetch,
  normalizeToken,
  readToken,
  SESSION_TOKEN_KEY,
} from "./auth-fetch";
import {
  CONNECTION_SCOPE,
  type ConnectionViewModel,
  createSessionModule,
  SET_TOKEN_COMMAND,
} from "./index";

/**
 * A `fetch`-shaped mock. Typing the args (not `() => ...`) gives `mock.calls`
 * the `[input, init?]` tuple shape, so `calls[i]?.[1]?.headers` typechecks.
 */
function fetchMock() {
  return vi.fn(
    async (
      _input: Parameters<typeof fetch>[0],
      _init?: Parameters<typeof fetch>[1],
    ) => new Response(null, { status: 200 }),
  );
}

/** In-memory {@link KeyValueStore} plus its backing map for assertions. */
function memStorage(seed?: Record<string, string>): {
  storage: KeyValueStore;
  map: Map<string, string>;
} {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    map,
    storage: {
      get: async (k) => map.get(k) ?? null,
      set: async (k, v) => void map.set(k, v),
      delete: async (k) => void map.delete(k),
    },
  };
}

function ports(storage: KeyValueStore): SdkPorts {
  return {
    fetch: vi.fn(async () => new Response("{}", { status: 200 })),
    storage,
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => undefined },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

/** Build a bare {@link ModuleContext} for exercising the module in isolation. */
function makeCtx(storage: KeyValueStore): {
  ctx: ModuleContext;
  store: ScopeStore;
  handlers: Map<string, (p: unknown) => Promise<unknown> | unknown>;
} {
  const store = new ScopeStore();
  const handlers = new Map<
    string,
    (p: unknown) => Promise<unknown> | unknown
  >();
  const ctx: ModuleContext = {
    config: { baseUrl: "http://127.0.0.1:4317", ports: ports(storage) },
    store,
    // The session module never resolves an engine client.
    clientFor: () => {
      throw new Error("session module must not resolve a client");
    },
    authExpiry: createAuthExpiryNotifier(store),
    registerCommand: (type, handler) => handlers.set(type, handler),
  };
  return { ctx, store, handlers };
}

describe("createAuthFetch (live-token injection)", () => {
  it("stamps Authorization from the persisted token", async () => {
    const { storage, map } = memStorage({ [SESSION_TOKEN_KEY]: "tok-1" });
    const base = fetchMock();
    const authed = createAuthFetch(base, storage);

    await authed("http://x/health");

    const init = base.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer tok-1",
    );
    // Ensure it reads from storage, not a captured constant.
    expect(map.get(SESSION_TOKEN_KEY)).toBe("tok-1");
  });

  it("passes through unchanged when no token is stored", async () => {
    const { storage } = memStorage();
    const base = fetchMock();
    const authed = createAuthFetch(base, storage);

    await authed("http://x/health", { method: "GET" });

    expect(base).toHaveBeenCalledWith("http://x/health", { method: "GET" });
  });

  it("rotates without rebuilding: the next request uses the new token", async () => {
    const { storage } = memStorage({ [SESSION_TOKEN_KEY]: "old" });
    const base = fetchMock();
    const authed = createAuthFetch(base, storage);

    await authed("http://x/a");
    await storage.set(SESSION_TOKEN_KEY, "new");
    await authed("http://x/b");

    expect(
      new Headers(base.mock.calls[0]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer old");
    expect(
      new Headers(base.mock.calls[1]?.[1]?.headers).get("Authorization"),
    ).toBe("Bearer new");
  });

  it("preserves caller-supplied headers", async () => {
    const { storage } = memStorage({ [SESSION_TOKEN_KEY]: "tok" });
    const base = fetchMock();
    const authed = createAuthFetch(base, storage);

    await authed("http://x/a", { headers: { "X-Trace": "abc" } });

    const headers = new Headers(base.mock.calls[0]?.[1]?.headers);
    expect(headers.get("X-Trace")).toBe("abc");
    expect(headers.get("Authorization")).toBe("Bearer tok");
  });
});

describe("normalizeToken", () => {
  it("collapses empty and null to null, keeps real tokens", () => {
    expect(normalizeToken(null)).toBeNull();
    expect(normalizeToken("")).toBeNull();
    expect(normalizeToken("t")).toBe("t");
  });
});

describe("session connection view-model", () => {
  let harness: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    harness = makeCtx(memStorage().storage);
  });

  it("publishes an idle snapshot synchronously, then ready after hydrate", async () => {
    const mod = createSessionModule(harness.ctx);

    expect(harness.store.getSnapshot(CONNECTION_SCOPE)).toEqual({
      status: "idle",
      baseUrl: "http://127.0.0.1:4317",
      hasToken: false,
    });

    await mod.whenReady();
    expect(harness.store.getSnapshot(CONNECTION_SCOPE)).toEqual({
      status: "ready",
      baseUrl: "http://127.0.0.1:4317",
      hasToken: false,
    });
  });

  it("hydrates hasToken=true from a pre-seeded token", async () => {
    const { storage } = memStorage({ [SESSION_TOKEN_KEY]: "persisted" });
    const h = makeCtx(storage);
    const mod = createSessionModule(h.ctx);

    await mod.whenReady();
    expect(
      (h.store.getSnapshot(CONNECTION_SCOPE) as ConnectionViewModel).hasToken,
    ).toBe(true);
  });
});

describe("setToken flow", () => {
  it("persists the token, updates the VM, and clears on null", async () => {
    const { storage, map } = memStorage();
    const h = makeCtx(storage);
    const mod = createSessionModule(h.ctx);
    await mod.whenReady();

    await mod.setToken("abc");
    expect(map.get(SESSION_TOKEN_KEY)).toBe("abc");
    expect(h.store.getSnapshot(CONNECTION_SCOPE)).toEqual({
      status: "ready",
      baseUrl: "http://127.0.0.1:4317",
      hasToken: true,
    });
    expect(await readToken(storage)).toBe("abc");

    await mod.setToken(null);
    expect(map.has(SESSION_TOKEN_KEY)).toBe(false);
    expect(
      (h.store.getSnapshot(CONNECTION_SCOPE) as ConnectionViewModel).hasToken,
    ).toBe(false);
  });

  it("an explicit setToken is not clobbered by a slower startup hydrate", async () => {
    // Storage whose read resolves on a later microtask than the setToken write.
    const map = new Map<string, string>([[SESSION_TOKEN_KEY, "stale"]]);
    const storage: KeyValueStore = {
      get: (k) => Promise.resolve().then(() => map.get(k) ?? null),
      set: async (k, v) => void map.set(k, v),
      delete: async (k) => void map.delete(k),
    };
    const h = makeCtx(storage);
    const mod = createSessionModule(h.ctx);

    await mod.setToken("fresh");
    await mod.whenReady();

    expect(
      (h.store.getSnapshot(CONNECTION_SCOPE) as ConnectionViewModel).hasToken,
    ).toBe(true);
    expect(map.get(SESSION_TOKEN_KEY)).toBe("fresh");
  });

  it("registers session/setToken and validates its payload", async () => {
    const h = makeCtx(memStorage().storage);
    createSessionModule(h.ctx);
    const handler = h.handlers.get(SET_TOKEN_COMMAND);
    expect(handler).toBeDefined();

    await handler?.({ token: "cmd-token" });
    expect(
      (h.store.getSnapshot(CONNECTION_SCOPE) as ConnectionViewModel).hasToken,
    ).toBe(true);

    await expect(handler?.({ token: 42 })).rejects.toThrow(/must be a string/);
    await expect(handler?.("nope")).rejects.toThrow(/payload must be/);
  });
});

describe("tokenExpired identity (token the failing request used)", () => {
  let store: ScopeStore;
  let events: SdkEvent[];

  beforeEach(() => {
    store = new ScopeStore();
    events = [];
    store.onEvent((e) => events.push(e));
  });

  // FINDING 1 (refresh storm): a request stamped token A is in flight when the
  // host proactively rotates to B (setToken B). A's late 401 must NOT be
  // attributed to the fresh token B — doing so re-refreshes a good token and
  // starts the exact storm this module exists to prevent.
  it("suppresses a stale 401 that lands after the token already rotated", () => {
    const n = createAuthExpiryNotifier(store);
    n.setToken("A"); // request stamped A goes in flight
    n.setToken("B"); // host proactively rotates while A is in flight
    n.notifyExpired("A"); // A's late 401 surfaces, carrying its own token
    expect(events).toEqual([]);
  });

  // FINDING 2 (spurious cold-start prompt): the agents /v1/events loop starts
  // before hydrate() resolves, so its first requests go out tokenless. A 401 on
  // a request that carried NO token is not an expiry — nothing was ever sent to
  // expire — so it must not emit tokenExpired.
  it("suppresses a 401 for a request that carried no token", () => {
    const n = createAuthExpiryNotifier(store);
    // no setToken: current token is null (pre-hydrate cold start)
    n.notifyExpired(null);
    expect(events).toEqual([]);
  });

  it("emits once for the current token, dedupes, and re-arms on rotation", () => {
    const n = createAuthExpiryNotifier(store);
    n.setToken("A");

    n.notifyExpired("A"); // genuine expiry of the live token
    n.notifyExpired("A"); // deduped
    expect(events).toEqual([{ type: TOKEN_EXPIRED_EVENT }]);

    n.setToken("B"); // host refreshed to a new token
    n.notifyExpired("B"); // a real 401 on the new token re-arms
    expect(events).toEqual([
      { type: TOKEN_EXPIRED_EVENT },
      { type: TOKEN_EXPIRED_EVENT },
    ]);
  });

  // A caller with no token identity (the agents module's `notifyExpired()`, and
  // any other legacy path) cannot attribute the 401, so it must not emit — the
  // auth-fetch layer, which knows the request's token, is authoritative.
  it("suppresses a report that carries no token identity", () => {
    const n = createAuthExpiryNotifier(store);
    n.setToken("A");
    n.notifyExpired(); // no argument
    expect(events).toEqual([]);
  });
});

describe("auth-fetch 401 classification (token identity threading)", () => {
  /** A `fetch` that returns `status` and, before responding, runs `onFlight`. */
  function respondingFetch(
    status: number,
    onFlight?: () => void | Promise<void>,
  ) {
    return (async () => {
      await onFlight?.();
      return new Response(null, { status });
    }) as typeof fetch;
  }

  /** Wire an auth-fetch to a notifier over the same storage, capturing events. */
  function wire(seed?: Record<string, string>, base?: typeof fetch) {
    const { storage, map } = memStorage(seed);
    const store = new ScopeStore();
    const events: SdkEvent[] = [];
    store.onEvent((e) => events.push(e));
    const notifier = createAuthExpiryNotifier(store);
    // The notifier's current-token mirror tracks storage, as the session module
    // keeps it via setToken.
    notifier.setToken(map.get(SESSION_TOKEN_KEY) ?? null);
    const authed = createAuthFetch(base ?? respondingFetch(401), storage);
    connectAuthExpiry(authed, (t) => notifier.notifyExpired(t));
    return { authed, events, storage, map, notifier };
  }

  it("emits tokenExpired once when the live token's request 401s", async () => {
    const w = wire({ [SESSION_TOKEN_KEY]: "live" });
    await w.authed("http://x/a");
    await w.authed("http://x/b"); // second 401 on the same token is deduped
    expect(w.events).toEqual([{ type: TOKEN_EXPIRED_EVENT }]);
  });

  // FINDING 1 end-to-end: the token rotates while the request is in flight, so
  // the 401 belongs to the OLD token — it must not signal against the new one.
  it("suppresses a 401 when the token rotated mid-flight", async () => {
    const w = wire({ [SESSION_TOKEN_KEY]: "A" });
    const base = respondingFetch(401, async () => {
      // Host proactively rotates while the A-stamped request is in flight.
      await w.storage.set(SESSION_TOKEN_KEY, "B");
      w.notifier.setToken("B");
    });
    const rotating = createAuthFetch(base, w.storage);
    connectAuthExpiry(rotating, (t) => w.notifier.notifyExpired(t));

    await rotating("http://x/a"); // stamped A, but current is now B
    expect(w.events).toEqual([]);
  });

  // FINDING 2 end-to-end: a tokenless request (cold start before hydrate) 401s.
  it("suppresses a 401 for a tokenless request", async () => {
    const w = wire(); // no token stored
    await w.authed("http://x/a");
    expect(w.events).toEqual([]);
  });

  it("does not report a non-401 response", async () => {
    const w = wire({ [SESSION_TOKEN_KEY]: "live" }, respondingFetch(500));
    await w.authed("http://x/a");
    expect(w.events).toEqual([]);
  });

  it("connectAuthExpiry is a no-op on a plain (non-auth) fetch", () => {
    const plain = (async () =>
      new Response(null, { status: 401 })) as typeof fetch;
    // Must not throw when the fetch carries no connect seam.
    expect(() => connectAuthExpiry(plain, () => {})).not.toThrow();
  });
});

describe("session via HoustonSdk (bridge + event wiring)", () => {
  function makeSdk(): HoustonSdk {
    return new HoustonSdk({
      baseUrl: "http://127.0.0.1:4317",
      ports: ports(memStorage().storage),
    });
  }

  it("dispatches session/setToken and reflects it on the connection scope", async () => {
    const sdk = makeSdk();
    await sdk.session.whenReady();

    const result = await sdk.dispatch({
      id: "c1",
      type: SET_TOKEN_COMMAND,
      payload: { token: "bridge-token" },
    });

    expect(result).toEqual({ id: "c1", ok: true, value: undefined });
    expect(
      (sdk.getSnapshot(CONNECTION_SCOPE) as ConnectionViewModel).hasToken,
    ).toBe(true);
  });

  it("returns ok:false for a malformed setToken payload", async () => {
    const sdk = makeSdk();
    await sdk.session.whenReady();

    const result = await sdk.dispatch({
      id: "c2",
      type: SET_TOKEN_COMMAND,
      payload: { token: 7 },
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ id: "c2", ok: false });
  });
});

describe("session module wiring (auth-fetch -> notifier)", () => {
  // Proves createSessionModule binds the auth-fetch's 401 classifier to the
  // shared notifier, so a live-token 401 reaches the store's event channel.
  it("emits tokenExpired when a live-token request 401s", async () => {
    const { storage } = memStorage();
    const store = new ScopeStore();
    const events: SdkEvent[] = [];
    store.onEvent((e) => events.push(e));
    const base = (async () =>
      new Response(null, { status: 401 })) as typeof fetch;
    const authed = createAuthFetch(base, storage);

    const ctx: ModuleContext = {
      config: {
        baseUrl: "http://127.0.0.1:4317",
        ports: { ...ports(storage), fetch: authed },
      },
      store,
      clientFor: () => {
        throw new Error("session module must not resolve a client");
      },
      authExpiry: createAuthExpiryNotifier(store),
      registerCommand: () => {},
    };

    const mod = createSessionModule(ctx);
    await mod.whenReady();
    await mod.setToken("t");

    await authed("http://x/protected");
    expect(events).toEqual([{ type: TOKEN_EXPIRED_EVENT }]);
  });
});
