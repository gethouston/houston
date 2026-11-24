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
import { createFanOutGate, type FanOutGate } from "./fan-out";
import type { ModuleContext } from "./module-context";
import type { SdkConfig } from "./ports";
import { moduleFactories, type SdkModules } from "./sdk-modules";
import { ScopeStore, type SdkEvent } from "./store";

/** The client every Houston surface binds. See the module header. */
export class HoustonSdk implements SdkModules {
  private readonly store: ScopeStore;
  private readonly authExpiry: AuthExpiryNotifier;
  private readonly commands: CommandRegistry;

  readonly session: SdkModules["session"];
  readonly agents: SdkModules["agents"];
  readonly conversations: SdkModules["conversations"];
  readonly delegation: SdkModules["delegation"];
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
  readonly plan: SdkModules["plan"];
  readonly push: SdkModules["push"];
  readonly channels: SdkModules["channels"];
  readonly linkedin: SdkModules["linkedin"];
  readonly heartbeat: SdkModules["heartbeat"];
  readonly routines: SdkModules["routines"];
  readonly skills: SdkModules["skills"];
  readonly files: SdkModules["files"];
  readonly citations: SdkModules["citations"];
  readonly migration: SdkModules["migration"];
  readonly browser: SdkModules["browser"];
  /** The per-agent engine client every module resolves its calls through — the
   *  seam a host binds when it drives the re-exported turn machinery itself. */
  readonly clientFor: (agentId: string) => HoustonEngineClient;
  /** The one bound on this client's roster-wide reads (`./fan-out`). */
  readonly fanOut: FanOutGate;

  constructor(config: SdkConfig) {
    this.store = new ScopeStore();
    this.authExpiry = createAuthExpiryNotifier(this.store);
    this.commands = new CommandRegistry();
    this.clientFor = createEngineClients(config);
    this.fanOut =
      config.ports.fanOut ?? createFanOutGate({ timers: config.ports.clock });

    const ctx: ModuleContext = {
      config,
      store: this.store,
      clientFor: this.clientFor,
      authExpiry: this.authExpiry,
      registerCommand: (type, handler) => this.commands.register(type, handler),
    };

    this.session = moduleFactories.createSessionModule(ctx);
    this.agents = moduleFactories.createAgentsModule(ctx);
    this.conversations = moduleFactories.createConversationsModule(ctx);
    this.delegation = moduleFactories.createDelegationModule(ctx);
    this.activities = moduleFactories.createActivitiesModule(ctx);
    this.turns = moduleFactories.createTurnsModule(
      ctx,
      (agentId, sessionKey, status, pendingInteraction, stamp) =>
        this.activities.setStatusBySessionKey(
          agentId,
          sessionKey,
          status,
          pendingInteraction,
          stamp,
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
    this.plan = moduleFactories.createPlanModule(ctx);
    this.push = moduleFactories.createPushModule(ctx);
    this.channels = moduleFactories.createChannelsModule(ctx);
    this.linkedin = moduleFactories.createLinkedInModule(ctx);
    this.heartbeat = moduleFactories.createHeartbeatModule(ctx);
    this.routines = moduleFactories.createRoutinesModule(ctx);
    this.skills = moduleFactories.createSkillsModule(ctx);
    this.files = moduleFactories.createFilesModule(ctx);
    this.citations = moduleFactories.createCitationsModule(
      ctx,
      this.files.saveAttachments,
    );
    this.migration = moduleFactories.createMigrationModule(ctx);
    this.browser = moduleFactories.createBrowserModule(ctx);
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
