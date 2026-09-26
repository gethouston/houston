/**
 * The account's contract: who the caller is (session, profile, API keys), the
 * space they work in (org roster, spaces, teams, workspaces, the subscription
 * behind a team), the preferences that follow them across surfaces, and the
 * appearance of the device they are working on (which does not follow them).
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
} from "./modules/channels";
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
export { PlanCommand, PlanHttpError, type PlanModule } from "./modules/plan";
export {
  PLUS_CHECKOUT_WINDOW_MS,
  type PlusCheckoutPorts,
  type PlusCheckoutState,
  PlusCheckoutTracker,
  plusCheckoutOutstanding,
} from "./modules/plan/checkout-tracker";
export {
  formatLaunchDate,
  formatLaunchMonthDay,
  formatLocalDate,
  formatLocalDateTime,
  formatPlanAmount,
  LAUNCH_TIME_ZONE,
  stripeCurrencyDecimals,
} from "./modules/plan/format";
export {
  freeScheduleAllowed,
  planComposerMode,
  planDialog,
  planLaunchRefreshDelay,
  planUsageMode,
  presenceDue,
  usagePercent,
} from "./modules/plan/model";
export {
  type PlusCheckoutRefusal,
  plusCheckoutRefusal,
} from "./modules/plan/refusals";
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
