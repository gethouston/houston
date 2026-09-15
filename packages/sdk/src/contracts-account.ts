/**
 * The account's contract: who the caller is (session, profile, API keys), the
 * space they work in (org roster, spaces, teams, workspaces, the subscription
 * behind a team) and the preferences that follow them across surfaces.
 *
 * Re-exported wholesale by the package barrel; import from `@houston/sdk`.
 */
// ===== Account module contract =========================================
export {
  AccountCommand,
  type AccountCommandType,
  AccountHttpError,
  type AccountModule,
  type ApiKey,
  type ApiKeyCreated,
  type EditableProfile,
  type EditableProfileCustom,
  type EditableProfileUpdate,
} from "./modules/account";
// ===== Billing module contract =========================================
// `BillingSummary` is the spaces module's — a space carries the same value on
// `OrgSummary.billing` — so it is exported once, under Spaces.
export {
  BILLING_INTERVALS,
  type BillingCheckout,
  BillingCommand,
  type BillingCommandType,
  BillingHttpError,
  type BillingModule,
} from "./modules/billing";
// ===== Org module contract =============================================
export {
  type AddOrgMemberResult,
  type AuditEntry,
  type ComputeUsage,
  type ComputeUsageRow,
  ORG_ROLES,
  OrgCommand,
  type OrgCommandType,
  OrgHttpError,
  type OrgInfo,
  type OrgInvite,
  type OrgMember,
  type OrgModule,
  type OrgPerson,
  type OrgRole,
  type UsageRow,
  type UserProfile,
  type UserProfilesResult,
} from "./modules/org";
// ===== Preferences module contract =====================================
export {
  PreferencesCommand,
  type PreferencesCommandType,
  type PreferencesModule,
} from "./modules/preferences";
// ===== Session module contract =========================================
// `createAuthFetch` + `SESSION_TOKEN_KEY` are host-facing: the host composes the
// auth-fetch into `ports.fetch` before constructing the SDK (see the module).
export {
  CONNECTION_SCOPE,
  type ConnectionStatus,
  type ConnectionViewModel,
  createAuthFetch,
  SESSION_TOKEN_KEY,
  SET_TOKEN_COMMAND,
  type SessionModule,
  type SetTokenPayload,
} from "./modules/session";
// ===== Spaces module contract ==========================================
export {
  type AgentMoveStart,
  type AgentMoveStatus,
  type BillingSummary,
  type OrgInviteSummary,
  type OrgSummary,
  type OrgsList,
  SpacesCommand,
  type SpacesCommandType,
  SpacesHttpError,
  type SpacesModule,
} from "./modules/spaces";
// ===== Teams module contract ===========================================
// `AgentAccess`/`AgentAssignment` are the agents module's; a team assignment
// carries the same value, so they are exported once, under Agents.
export {
  type AgentEffortLevel,
  type AgentModelChoice,
  type AgentModelChoiceInfo,
  type AgentSettings,
  type AgentSettingsUpdate,
  type AgentTeam,
  type AgentTeamInput,
  type AgentTeamMember,
  type AgentTeamPatch,
  TeamsCommand,
  type TeamsCommandType,
  TeamsHttpError,
  type TeamsModule,
  type TriggerStatusItem,
  type TriggerStatusState,
} from "./modules/teams";
// ===== Workspaces module contract ======================================
export {
  type SidebarGroup,
  type SidebarLayout,
  type Workspace,
  type WorkspaceKind,
  WorkspacesCommand,
  type WorkspacesCommandType,
  WorkspacesHttpError,
  type WorkspacesModule,
} from "./modules/workspaces";
