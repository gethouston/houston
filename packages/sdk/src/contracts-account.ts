/**
 * The account's contract: who the caller is (session, profile, API keys), the
 * space they work in (org roster, spaces, teams, workspaces), and the
 * appearance of the device they are working on (which does not follow them).
 * Their preferences: contracts-preferences.ts. What an org pays and may use:
 * contracts-billing.ts.
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
export {
  apiStartMissionRequest,
  apiTryKeyRequest,
} from "./modules/account/api-examples";
export {
  type ApiSetupPromptInput,
  apiSetupPrompt,
  HOUSTON_API_DOCS,
  HOUSTON_API_KEY_ENV,
} from "./modules/account/api-setup-prompt";
// ===== Appearance module contract ======================================
// The vocabulary and its rules are also published as `@houston/sdk/appearance`,
// for a surface's pre-paint path: it resolves a theme before any kernel exists.
export {
  AppearanceCommand,
  type AppearanceCommandType,
  type AppearanceModule,
} from "./modules/appearance";
export {
  THEME_KEYS,
  type ThemeKey,
  type ThemeReading,
  type UnusableThemeValue,
} from "./modules/appearance/device-keys";
export {
  DEFAULT_PALETTE,
  DEFAULT_THEME_PREFERENCE,
  followsSystem,
  listPalettes,
  type Palette,
  type PaletteId,
  type PaletteSwatch,
  paletteSwatch,
  parsePaletteId,
  parseThemeMode,
  type ResolvedMode,
  type ResolvedTheme,
  resolveTheme,
  sameTheme,
  type ThemeMode,
  type ThemePreference,
} from "./modules/appearance/model";
export { InvalidThemeError } from "./modules/appearance/validate";
// ===== Channels module contract ========================================
export {
  CHANNEL_PROVIDER_IDS,
  type ChannelConnection,
  type ChannelLink,
  type ChannelProvider,
  type ChannelProviderId,
  type ChannelStatus,
  ChannelsCommand,
  type ChannelsCommandType,
  ChannelsHttpError,
  type ChannelsModule,
  type SlackAuthorization,
  type SlackCompletion,
  type SlackConnectAnswer,
  type SlackConnectReturn,
} from "./modules/channels";
// ===== Org module contract =============================================
export {
  type AddOrgMemberOutcome,
  type AddOrgMemberResult,
  type AuditEntry,
  type ChargeSeatQuote,
  type ComputeUsage,
  type ComputeUsageRow,
  type MemberRoutine,
  type MemberRoutineKind,
  type MemberRoutines,
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
  type SeatAddedNote,
  type SeatAddStep,
  type SeatChargeView,
  type SeatNote,
  type SeatQuote,
  type SeatRemoveNote,
  seatAddBlocked,
  seatAddedNote,
  seatAddRefusal,
  seatAddStep,
  seatChargeView,
  seatNote,
  seatRemoveNote,
  type UsageRow,
  type UserProfile,
  type UserProfilesResult,
} from "./modules/org";
export {
  WorkspacePreferenceUnavailable,
  workspacePreferenceErrorKind,
} from "./modules/preferences/workspace-selection-errors";
export {
  type WorkspacePreferenceReporter,
  WorkspaceSelectionState,
} from "./modules/preferences/workspace-selection-state";
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
  type CreateOrgOutcome,
  type FreeOrg,
  type OrgBilling,
  type OrgInviteSummary,
  type OrgPlan,
  type OrgSummary,
  type OrgsList,
  SpacesCommand,
  type SpacesCommandType,
  SpacesHttpError,
  type SpacesModule,
} from "./modules/spaces";
export {
  activeOrg,
  activeOrgBilling,
  activeSpaceOrgSlug,
} from "./modules/spaces/active-space";
export { freeOrgTakenSlug } from "./modules/spaces/create-refusals";
export * from "./modules/spaces/move-out";
export * from "./modules/spaces/move-refusals";
// ===== Teams module contract ===========================================
// `AgentAccess`/`AgentAssignment` are the agents module's; a team assignment
// carries the same value, so they are exported once, under Agents.
export {
  type AgentEffortLevel,
  type AgentModelChoice,
  type AgentModelChoiceInfo,
  type AgentSettings,
  type AgentSettingsUpdate,
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
export { resolveActiveWorkspace } from "./modules/workspaces/selection";
