import { HoustonEngineClient } from "@houston/runtime-client";
import {
  type AuthExpiryNotifier,
  createAuthExpiryNotifier,
} from "./auth-expiry";
import {
  type CommandEnvelope,
  CommandRegistry,
  type CommandResult,
  isCommandEnvelope,
} from "./commands";
import type { ModuleContext } from "./module-context";
import { createActivitiesModule } from "./modules/activities";
import { createAgentsModule } from "./modules/agents";
import { createConversationsModule } from "./modules/conversations";
import { createMissionsSearchModule } from "./modules/missions-search";
import { createSessionModule } from "./modules/session";
import { createTurnsModule } from "./modules/turns";
import type { SdkConfig } from "./ports";
import { ScopeStore, type SdkEvent } from "./store";

/** Best-effort extraction of a correlation id from a malformed envelope. */
function envelopeId(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    const id = (value as Record<string, unknown>).id;
    if (typeof id === "string") return id;
  }
  return "";
}

/**
 * The single Houston client implementation that sits under every surface —
 * web, desktop, and (via the bridge path) native.
 *
 * It owns exactly one of each collaborator and threads them to its modules:
 *  - a {@link ScopeStore} — the reactive read side (scope snapshots + events),
 *  - a per-agent {@link HoustonEngineClient} cache (see `clientFor`) — the typed
 *    HTTP/SSE engine transport, each rooted at an agent's sandbox and wired to
 *    the injected `fetch`,
 *  - an {@link AuthExpiryNotifier} — the one 401 → `tokenExpired` signal shared
 *    by every module, and
 *  - a {@link CommandRegistry} — the write side shared by the typed facade and
 *    the bridge.
 *
 * **Modules are internal.** They are composed once in the constructor; each
 * `create<Name>Module` registers its command handlers and returns a typed
 * facade exposed as a property (`sdk.agents`, `sdk.conversations`, …). The
 * facade type is whatever the module returns — the kernel does not constrain
 * it, so a module owns its own public shape.
 *
 * **Two ways to call the same code.** Typed facade methods are the ergonomic,
 * in-process path. {@link dispatch} is the bridge path: a native shell serializes
 * a {@link CommandEnvelope}, and it routes to the exact same registered handler.
 * No write logic is duplicated between the two.
 *
 * Everything crossing {@link getSnapshot}/{@link subscribe}/{@link dispatch}/
 * {@link on} is plain JSON.
 */
export class HoustonSdk {
  private readonly config: SdkConfig;
  private readonly store: ScopeStore;
  private readonly authExpiry: AuthExpiryNotifier;
  private readonly commands: CommandRegistry;
  /** Per-agent engine clients, keyed by agent id (`""` = the base client). */
  private readonly clients = new Map<string, HoustonEngineClient>();

  /** Session/connection facade (auth, connection state). */
  readonly session: ReturnType<typeof createSessionModule>;
  /** Agent-list facade. */
  readonly agents: ReturnType<typeof createAgentsModule>;
  /** Conversation facade (history, per-conversation streams). */
  readonly conversations: ReturnType<typeof createConversationsModule>;
  /** Turn facade (send message, drive a turn). */
  readonly turns: ReturnType<typeof createTurnsModule>;
  /** Board/missions facade (per-agent activities read + CRUD). */
  readonly activities: ReturnType<typeof createActivitiesModule>;
  /** Mission-search facade (ranked full-text search across missions). */
  readonly missions: ReturnType<typeof createMissionsSearchModule>;

  constructor(config: SdkConfig) {
    this.config = config;
    this.store = new ScopeStore();
    this.authExpiry = createAuthExpiryNotifier(this.store);
    this.commands = new CommandRegistry();

    const ctx: ModuleContext = {
      config,
      store: this.store,
      clientFor: (agentId) => this.clientFor(agentId),
      authExpiry: this.authExpiry,
      registerCommand: (type, handler) => this.commands.register(type, handler),
    };

    // ===== Module wiring points ==========================================
    // Each factory registers its command handlers into `ctx` and returns the
    // typed facade surfaced below. Session is composed FIRST so the shared auth
    // notifier and the `session/setToken` handler exist before the agents
    // reactivity stream (composed next) can produce a 401. That ordering does
    // NOT by itself prevent a startup 401 from firing a bogus `tokenExpired`:
    // session hydration (`whenReady`) reads the persisted token ASYNCHRONOUSLY,
    // so the stream can 401 while the token is still null. The real guard is the
    // notifier's tokenless-401 suppression — a 401 with no token set is not a
    // token EXPIRY, so it never emits. The rest are dependency-neutral.
    this.session = createSessionModule(ctx);
    this.agents = createAgentsModule(ctx);
    this.conversations = createConversationsModule(ctx);
    this.turns = createTurnsModule(ctx);
    this.activities = createActivitiesModule(ctx);
    this.missions = createMissionsSearchModule(ctx);
    // =====================================================================
  }

  /**
   * Memoized engine client rooted at agent `agentId`'s sandbox
   * (`/agents/<id>`), or the base client for an empty id (flat single-runtime
   * routes). Every client shares the injected `fetch`, which carries auth.
   */
  private clientFor(agentId: string): HoustonEngineClient {
    let client = this.clients.get(agentId);
    if (!client) {
      const baseUrl =
        agentId === ""
          ? this.config.baseUrl
          : `${this.config.baseUrl}/agents/${encodeURIComponent(agentId)}`;
      client = new HoustonEngineClient({
        baseUrl,
        fetch: this.config.ports.fetch,
      });
      this.clients.set(agentId, client);
    }
    return client;
  }

  /** Latest snapshot for `scope`, or `undefined` if none has been published. */
  getSnapshot(scope: string): unknown | undefined {
    return this.store.getSnapshot(scope);
  }

  /** Subscribe to a scope's snapshots. Returns an unsubscribe function. */
  subscribe(scope: string, cb: (snapshot: unknown) => void): () => void {
    return this.store.subscribe(scope, cb);
  }

  /** Subscribe to the global event channel. Returns an unsubscribe function. */
  on(cb: (event: SdkEvent) => void): () => void {
    return this.store.onEvent(cb);
  }

  /**
   * The bridge path. Validate an untrusted envelope and route it to the same
   * handler the typed facade uses. Never throws: a malformed envelope or an
   * unknown/failing command resolves to an `ok: false` {@link CommandResult}.
   */
  async dispatch(envelope: CommandEnvelope): Promise<CommandResult> {
    if (!isCommandEnvelope(envelope)) {
      return {
        id: envelopeId(envelope),
        ok: false,
        error: { message: "invalid command envelope" },
      };
    }
    return this.commands.dispatch(envelope);
  }

  /**
   * Tear down every long-lived resource the SDK holds: the agents + activities
   * reactivity streams and all in-flight turn/observer streams. Call it when the SDK is
   * being discarded (logout, teardown) so no background fetch loop outlives it.
   * Idempotent-friendly at the module level; the SDK instance is single-use
   * after disposal.
   */
  dispose(): void {
    this.agents.dispose();
    this.turns.dispose();
    this.activities.dispose();
  }
}
