/**
 * The SDK kernel — the single Houston client implementation under every
 * surface: desktop and web.
 *
 * It owns exactly one of each collaborator and threads them to its modules: a
 * `ScopeStore` (the reactive read side), a per-agent engine-client cache (the
 * typed HTTP/SSE transport), an `AuthExpiryNotifier` (the one 401 →
 * `tokenExpired` signal), and a `CommandRegistry` (the write side).
 *
 * Modules are INTERNAL: each `create<Name>Module` is composed once in the
 * constructor, registers its command handlers, and returns the typed facade
 * surfaced as a property (`sdk.agents`, `sdk.conversations`, …). The kernel
 * does not constrain that facade's type, so a module owns its own shape.
 *
 * TWO WAYS TO CALL THE SAME CODE: a facade method is the in-process path,
 * `dispatch` takes the same call as a JSON envelope across a serialization
 * boundary — both land on the same registered handler, so no write logic exists
 * twice. Everything crossing `getSnapshot`/`subscribe`/`dispatch`/`on` is plain
 * JSON.
 */

import type { HoustonEngineClient } from "@houston/runtime-client";
import {
  type AuthExpiryNotifier,
  createAuthExpiryNotifier,
} from "./auth-expiry";
import {
  type CommandEnvelope,
  CommandRegistry,
  type CommandResult,
  envelopeId,
  isCommandEnvelope,
} from "./commands";
import { createEngineClients } from "./engine-clients";
import type { ModuleContext } from "./module-context";
import type { SdkConfig } from "./ports";
import { moduleFactories, type SdkModules } from "./sdk-modules";
import { ScopeStore, type SdkEvent } from "./store";

/** The client every Houston surface binds. See the module header. */
export class HoustonSdk implements SdkModules {
  private readonly store: ScopeStore;
  private readonly authExpiry: AuthExpiryNotifier;
  private readonly commands: CommandRegistry;

  // The facades, mounted by the constructor below. What each one covers, and
  // the factory whose return type it is, live in `./sdk-modules`.
  readonly session: SdkModules["session"];
  readonly agents: SdkModules["agents"];
  readonly conversations: SdkModules["conversations"];
  readonly turns: SdkModules["turns"];
  readonly activities: SdkModules["activities"];
  readonly missions: SdkModules["missions"];
  readonly providers: SdkModules["providers"];
  readonly integrations: SdkModules["integrations"];
  readonly preferences: SdkModules["preferences"];
  readonly appearance: SdkModules["appearance"];
  readonly spaces: SdkModules["spaces"];
  readonly workspaces: SdkModules["workspaces"];
  readonly account: SdkModules["account"];
  readonly org: SdkModules["org"];
  readonly teams: SdkModules["teams"];
  readonly billing: SdkModules["billing"];
  readonly channels: SdkModules["channels"];
  readonly routines: SdkModules["routines"];
  readonly skills: SdkModules["skills"];
  readonly files: SdkModules["files"];
  readonly migration: SdkModules["migration"];
  /** The per-agent engine client every module resolves its calls through — the
   *  seam a host binds when it drives the re-exported turn machinery itself. */
  readonly clientFor: (agentId: string) => HoustonEngineClient;

  constructor(config: SdkConfig) {
    this.store = new ScopeStore();
    this.authExpiry = createAuthExpiryNotifier(this.store);
    this.commands = new CommandRegistry();
    this.clientFor = createEngineClients(config);

    const ctx: ModuleContext = {
      config,
      store: this.store,
      clientFor: this.clientFor,
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
    this.session = moduleFactories.createSessionModule(ctx);
    this.agents = moduleFactories.createAgentsModule(ctx);
    this.conversations = moduleFactories.createConversationsModule(ctx);
    // Activities BEFORE turns: the turns module's default board-status output
    // persists a card by session key through the activities module, so that
    // capability must exist first. Injected as a bound function (not the whole
    // module) so turns depends on one activities method, never the reverse.
    this.activities = moduleFactories.createActivitiesModule(ctx);
    this.turns = moduleFactories.createTurnsModule(
      ctx,
      (agentId, sessionKey, status, pendingInteraction) =>
        this.activities.setStatusBySessionKey(
          agentId,
          sessionKey,
          status,
          pendingInteraction,
        ),
    );
    this.missions = moduleFactories.createMissionsSearchModule(ctx);
    this.providers = moduleFactories.createProvidersModule(ctx);
    this.integrations = moduleFactories.createIntegrationsModule(ctx);
    this.preferences = moduleFactories.createPreferencesModule(ctx);
    this.appearance = moduleFactories.createAppearanceModule(ctx);
    this.spaces = moduleFactories.createSpacesModule(ctx);
    this.workspaces = moduleFactories.createWorkspacesModule(ctx);
    this.account = moduleFactories.createAccountModule(ctx);
    this.org = moduleFactories.createOrgModule(ctx);
    this.teams = moduleFactories.createTeamsModule(ctx);
    this.billing = moduleFactories.createBillingModule(ctx);
    this.channels = moduleFactories.createChannelsModule(ctx);
    this.routines = moduleFactories.createRoutinesModule(ctx);
    this.skills = moduleFactories.createSkillsModule(ctx);
    this.files = moduleFactories.createFilesModule(ctx);
    this.migration = moduleFactories.createMigrationModule(ctx);
    // =====================================================================
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
   * The dispatch path. Validate an untrusted envelope and route it to the same
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
