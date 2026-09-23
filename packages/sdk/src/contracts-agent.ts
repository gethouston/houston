/**
 * One agent's contract: its list entry and library, its mission board, its
 * files and routines, its skills (its own and the workspace library), and the
 * AI providers and outside apps it reaches.
 *
 * Re-exported wholesale by the package barrel; import from `@houston/sdk`.
 */
// ===== Activities module contract ======================================
export {
  ACTIVITY_CHANGED_EVENT,
  ACTIVITY_STATUSES,
  ActivitiesCommand,
  type ActivitiesCommandType,
  ActivitiesHttpError,
  type ActivitiesModule,
  type ActivitiesViewModel,
  type ActivitiesWrites,
  type ActivityItem,
  activitiesScope,
  type CreatedActivity,
} from "./modules/activities";
// ===== Agents module contract ==========================================
export {
  AGENTS_CHANGED_EVENT,
  AGENTS_SCOPE,
  type AgentAccess,
  type AgentAssignment,
  type AgentCreateInput,
  type AgentListItem,
  type AgentsAccount,
  AgentsCommand,
  type AgentsCommandType,
  AgentsHttpError,
  type AgentsLibrary,
  type AgentsModule,
  type AgentsViewModel,
  type AgentsWrites,
  type InstalledConfig,
  type WireAgent,
} from "./modules/agents";
// ===== Files module contract ===========================================
export {
  FilesCommand,
  type FilesCommandType,
  FilesHttpError,
  type FilesModule,
  type FileUpload,
  type ProjectFile,
} from "./modules/files";
// ===== Integrations module contract ====================================
export {
  type ConnectResult,
  INTEGRATIONS_SCOPE,
  type IntegrationConnection,
  IntegrationsCommand,
  type IntegrationsCommandType,
  type IntegrationsModule,
  type IntegrationsUnavailableReason,
  type IntegrationsViewModel,
  type IntegrationsWrites,
  type IntegrationToolkit,
} from "./modules/integrations";
export {
  type CustomTransportChoice,
  customIntegrationScope,
  resolveCustomTransportAgent,
} from "./modules/integrations/custom-scope";
export type {
  AddCustomIntegrationInput,
  CustomAuthField,
  CustomAuthMethod,
  CustomDetectResult,
  CustomIntegrationDetails,
  CustomIntegrationState,
  CustomIntegrationView,
  CustomToolInfo,
} from "./modules/integrations/custom-types";
export type { TriggerType } from "./modules/integrations/reads";
export { IntegrationsHttpError } from "./modules/integrations/types";
// ===== Migration module contract =======================================
export {
  MigrationHttpError,
  type MigrationImportOptions,
  type MigrationImportResult,
  type MigrationModule,
} from "./modules/migration";
// ===== Providers module contract =======================================
export {
  type AuthStatus,
  type CustomEndpoint,
  type LoginInfo,
  type LoginOptions,
  type LoginState,
  mergeProviders,
  overlayStatus,
  type ProviderCredentialWrites,
  type ProviderId,
  ProvidersCommand,
  type ProvidersCommandType,
  ProvidersHttpError,
  type ProvidersModule,
  type ProvidersViewModel,
  type ProvidersWrites,
  type ProviderVM,
  providersScope,
  type SetModelOptions,
} from "./modules/providers";
// ===== Routines module contract ========================================
export {
  type NewRoutine,
  type Routine,
  type RoutineRun,
  RoutinesCommand,
  type RoutinesCommandType,
  RoutinesHttpError,
  type RoutinesModule,
  type RoutineUpdate,
  type WebhookKeyReveal,
} from "./modules/routines";
// ===== Skills module contract ==========================================
export {
  AgentSkillsCommand,
  type AgentSkillsCommandType,
  type AgentSkillsFacade,
  AgentSkillsHttpError,
  type HostSkillSummary,
  type NewSkill,
  type SkillDetail,
  type SkillInputDef,
  type SkillSummary,
  type SkillsManifest,
  type SkillsModule,
} from "./modules/skills";
// ===== Shared skills contract ==========================================
export {
  type NewSharedSkill,
  type SharedSkillDiagnostic,
  type SharedSkillSummary,
  SharedSkillsCommand,
  type SharedSkillsCommandType,
  SharedSkillsHttpError,
  type SharedSkillsList,
  type SharedSkillsModule,
} from "./modules/skills/types-shared";
