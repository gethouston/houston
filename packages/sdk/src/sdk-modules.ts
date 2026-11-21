import { createAccountModule } from "./modules/account";
import { createActivitiesModule } from "./modules/activities";
import { createAgentsModule } from "./modules/agents";
import { createAppearanceModule } from "./modules/appearance";
import { createBillingModule } from "./modules/billing";
import { createBrowserModule } from "./modules/browser";
import { createChannelsModule } from "./modules/channels";
import { createCitationsModule } from "./modules/citations";
import { createConversationsModule } from "./modules/conversations";
import { createDelegationModule } from "./modules/delegation";
import { createFilesModule } from "./modules/files";
import { createHeartbeatModule } from "./modules/heartbeat";
import { createIntegrationsModule } from "./modules/integrations";
import { createLinkedInModule } from "./modules/linkedin";
import { createMigrationModule } from "./modules/migration";
import { createMissionsSearchModule } from "./modules/missions-search";
import { createOrgModule } from "./modules/org";
import { createPlanModule } from "./modules/plan";
import { createPreferencesModule } from "./modules/preferences";
import { createProvidersModule } from "./modules/providers";
import { createPushModule } from "./modules/push";
import { createRoutinesModule } from "./modules/routines";
import { createSessionModule } from "./modules/session";
import { createSkillsModule } from "./modules/skills";
import { createSpacesModule } from "./modules/spaces";
import { createTeamsModule } from "./modules/teams";
import { createTurnsModule } from "./modules/turns";
import { createWorkspacesModule } from "./modules/workspaces";

export interface SdkModules {
  readonly session: ReturnType<typeof createSessionModule>;
  readonly agents: ReturnType<typeof createAgentsModule>;
  readonly conversations: ReturnType<typeof createConversationsModule>;
  readonly delegation: ReturnType<typeof createDelegationModule>;
  readonly turns: ReturnType<typeof createTurnsModule>;
  readonly activities: ReturnType<typeof createActivitiesModule>;
  readonly missions: ReturnType<typeof createMissionsSearchModule>;
  readonly providers: ReturnType<typeof createProvidersModule>;
  readonly integrations: ReturnType<typeof createIntegrationsModule>;
  readonly preferences: ReturnType<typeof createPreferencesModule>;
  readonly appearance: ReturnType<typeof createAppearanceModule>;
  readonly spaces: ReturnType<typeof createSpacesModule>;
  readonly workspaces: ReturnType<typeof createWorkspacesModule>;
  readonly account: ReturnType<typeof createAccountModule>;
  readonly org: ReturnType<typeof createOrgModule>;
  readonly teams: ReturnType<typeof createTeamsModule>;
  readonly billing: ReturnType<typeof createBillingModule>;
  readonly plan: ReturnType<typeof createPlanModule>;
  readonly push: ReturnType<typeof createPushModule>;
  readonly channels: ReturnType<typeof createChannelsModule>;
  readonly linkedin: ReturnType<typeof createLinkedInModule>;
  readonly heartbeat: ReturnType<typeof createHeartbeatModule>;
  readonly routines: ReturnType<typeof createRoutinesModule>;
  readonly skills: ReturnType<typeof createSkillsModule>;
  readonly files: ReturnType<typeof createFilesModule>;
  readonly citations: ReturnType<typeof createCitationsModule>;
  readonly migration: ReturnType<typeof createMigrationModule>;
  readonly browser: ReturnType<typeof createBrowserModule>;
}

export const moduleFactories = {
  createAccountModule,
  createActivitiesModule,
  createAgentsModule,
  createAppearanceModule,
  createBillingModule,
  createBrowserModule,
  createPlanModule,
  createPushModule,
  createChannelsModule,
  createCitationsModule,
  createConversationsModule,
  createDelegationModule,
  createFilesModule,
  createHeartbeatModule,
  createIntegrationsModule,
  createLinkedInModule,
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
