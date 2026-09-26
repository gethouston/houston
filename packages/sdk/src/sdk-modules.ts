/**
 * The SDK's module bag: every factory the kernel composes, and the facade each
 * one is reached at.
 *
 * It lives beside the kernel so `sdk.ts` carries the kernel's behavior alone.
 * A facade type is always `ReturnType<typeof create<Name>Module>` and never a
 * hand-written shape — a module owns what it publishes, so the kernel cannot
 * describe it wrongly, and a facade cannot drift from its factory.
 */

import { createAccountModule } from "./modules/account";
import { createActivitiesModule } from "./modules/activities";
import { createAgentsModule } from "./modules/agents";
import { createAppearanceModule } from "./modules/appearance";
import { createBillingModule } from "./modules/billing";
import { createChannelsModule } from "./modules/channels";
import { createConversationsModule } from "./modules/conversations";
import { createFilesModule } from "./modules/files";
import { createIntegrationsModule } from "./modules/integrations";
import { createMigrationModule } from "./modules/migration";
import { createMissionsSearchModule } from "./modules/missions-search";
import { createOrgModule } from "./modules/org";
import { createPlanModule } from "./modules/plan";
import { createPreferencesModule } from "./modules/preferences";
import { createProvidersModule } from "./modules/providers";
import { createRoutinesModule } from "./modules/routines";
import { createSessionModule } from "./modules/session";
import { createSkillsModule } from "./modules/skills";
import { createSpacesModule } from "./modules/spaces";
import { createTeamsModule } from "./modules/teams";
import { createTurnsModule } from "./modules/turns";
import { createWorkspacesModule } from "./modules/workspaces";

/** Every facade `HoustonSdk` publishes, by the property a caller reaches it at. */
export interface SdkModules {
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
  /** Appearance facade (this device's theme mode and its two palette picks). */
  readonly appearance: ReturnType<typeof createAppearanceModule>;
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
  /** Billing facade (the team's subscription + the Stripe hand-offs). */
  readonly billing: ReturnType<typeof createBillingModule>;
  readonly plan: ReturnType<typeof createPlanModule>;
  /** Channels facade (the messaging accounts the personal assistant answers in). */
  readonly channels: ReturnType<typeof createChannelsModule>;
  /** Routines facade (an agent's scheduled work, its runs, its webhook key). */
  readonly routines: ReturnType<typeof createRoutinesModule>;
  /** Skills facade (an agent's own skills and the manifest enabling them). */
  readonly skills: ReturnType<typeof createSkillsModule>;
  /** Files facade (an agent's workspace listing, reads, moves + uploads). */
  readonly files: ReturnType<typeof createFilesModule>;
  /** Migration facade (an agent's data out as zip chunks, and into another). */
  readonly migration: ReturnType<typeof createMigrationModule>;
}

/**
 * The factories themselves, as one namespace the kernel imports once. Composing
 * them stays the kernel constructor's job: the order it calls them in is a
 * dependency, and `sdk.<property> = create<Name>Module(ctx)` there is also what
 * names each namespace for the generated assistant catalog
 * (`scripts/assistant-catalog/assistant-facade-surface.ts`).
 */
export const moduleFactories = {
  createAccountModule,
  createActivitiesModule,
  createAgentsModule,
  createAppearanceModule,
  createBillingModule,
  createPlanModule,
  createChannelsModule,
  createConversationsModule,
  createFilesModule,
  createIntegrationsModule,
  createMigrationModule,
  createMissionsSearchModule,
  createOrgModule,
  createPreferencesModule,
  createProvidersModule,
  createRoutinesModule,
  createSessionModule,
  createSkillsModule,
  createSpacesModule,
  createTeamsModule,
  createTurnsModule,
  createWorkspacesModule,
} as const;
