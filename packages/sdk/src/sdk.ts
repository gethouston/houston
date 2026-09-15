/**
 * The SDK kernel — the single Houston client implementation under every
 * surface: web, desktop, and (via the bridge path) native.
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
 * `dispatch` is the bridge path a native shell serializes into — both land on
 * the same registered handler, so no write logic exists twice. Everything
 * crossing `getSnapshot`/`subscribe`/`dispatch`/`on` is plain JSON.
 */

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
import { createAccountModule } from "./modules/account";
import { createActivitiesModule } from "./modules/activities";
import { createAgentsModule } from "./modules/agents";
import { createConversationsModule } from "./modules/conversations";
import { createFilesModule } from "./modules/files";
import { createIntegrationsModule } from "./modules/integrations";
import { createMissionsSearchModule } from "./modules/missions-search";
import { createOrgModule } from "./modules/org";
import { createPreferencesModule } from "./modules/preferences";
import { createProvidersModule } from "./modules/providers";
import { createRoutinesModule } from "./modules/routines";
import { createSessionModule } from "./modules/session";
import { createSkillsModule } from "./modules/skills";
import { createSpacesModule } from "./modules/spaces";
import { createTeamsModule } from "./modules/teams";
import { createTurnsModule } from "./modules/turns";
import { createWorkspacesModule } from "./modules/workspaces";
import type { SdkConfig } from "./ports";
import { ScopeStore, type SdkEvent } from "./store";

/** The client every Houston surface binds. See the module header. */
export class HoustonSdk {
  private readonly store: ScopeStore;
  private readonly authExpiry: AuthExpiryNotifier;
  private readonly commands: CommandRegistry;

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
  /** Per-agent AI-provider facade (connect, status, active model). */
  readonly providers: ReturnType<typeof createProvidersModule>;
  /** Integrations facade (Composio readiness + connections). */
  readonly integrations: ReturnType<typeof createIntegrationsModule>;
  /** Preferences facade (key/value preferences + workspace locale). */
  readonly preferences: ReturnType<typeof createPreferencesModule>;
  /** Spaces facade (memberships, invitations, agent moves between spaces). */
  readonly spaces: ReturnType<typeof createSpacesModule>;
  /** Workspaces facade (workspace list, agent docs, context notes, sidebar). */
  readonly workspaces: ReturnType<typeof createWorkspacesModule>;
  /** Account facade (the caller's own display profile + personal API keys). */
  readonly account: ReturnType<typeof createAccountModule>;
  /** Org facade (the active space's roster, roles, invitations + usage). */
  readonly org: ReturnType<typeof createOrgModule>;
  /** Teams facade (the space's team directory + per-agent policy). */
  readonly teams: ReturnType<typeof createTeamsModule>;
  /** Routines facade (an agent's scheduled work, its runs, its webhook key). */
  readonly routines: ReturnType<typeof createRoutinesModule>;
  /** Skills facade (an agent's own skills and the manifest enabling them). */
  readonly skills: ReturnType<typeof createSkillsModule>;
  /** Files facade (an agent's workspace listing, reads, moves + uploads). */
  readonly files: ReturnType<typeof createFilesModule>;

  constructor(config: SdkConfig) {
    this.store = new ScopeStore();
    this.authExpiry = createAuthExpiryNotifier(this.store);
    this.commands = new CommandRegistry();

    const ctx: ModuleContext = {
      config,
      store: this.store,
      clientFor: createEngineClients(config),
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
    // Activities BEFORE turns: the turns module's default board-status output
    // persists a card by session key through the activities module, so that
    // capability must exist first. Injected as a bound function (not the whole
    // module) so turns depends on one activities method, never the reverse.
    this.activities = createActivitiesModule(ctx);
    this.turns = createTurnsModule(
      ctx,
      (agentId, sessionKey, status, pendingInteraction) =>
        this.activities.setStatusBySessionKey(
          agentId,
          sessionKey,
          status,
          pendingInteraction,
        ),
    );
    this.missions = createMissionsSearchModule(ctx);
    this.providers = createProvidersModule(ctx);
    this.integrations = createIntegrationsModule(ctx);
    this.preferences = createPreferencesModule(ctx);
    this.spaces = createSpacesModule(ctx);
    this.workspaces = createWorkspacesModule(ctx);
    this.account = createAccountModule(ctx);
    this.org = createOrgModule(ctx);
    this.teams = createTeamsModule(ctx);
    this.routines = createRoutinesModule(ctx);
    this.skills = createSkillsModule(ctx);
    this.files = createFilesModule(ctx);
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
