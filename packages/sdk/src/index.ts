/**
 * `@houston/sdk` — the single headless Houston client.
 *
 * One client implementation under every surface (web, desktop). Reads flow as
 * scope snapshots; writes flow as commands. See README.md for the model.
 *
 * This barrel is the package's public API: the kernel (`HoustonSdk`, the store,
 * the command registry), the shared auth surface, and each module's CONTRACT —
 * its view-model types, scope helpers, and command constants that a consumer
 * subscribes to and dispatches. The `create<Name>Module` factories are internal
 * (the kernel composes them); a host uses `new HoustonSdk(...)`, not a factory.
 */

// Rules that live once in @houston/domain and are re-exported for surfaces:
// the agent-name rule, so a surface validates BEFORE submitting instead of
// rendering the server's rejection (HOU-1166), and the job-description grammar
// (`CLAUDE.md`), which the app edits and the runtime renders into the prompt.
export {
  AGENT_NAME_MAX_LENGTH,
  type AgentNameValidation,
  composeJobDescription,
  type InvalidAgentNameReason,
  type JobDescriptionFields,
  type ParsedJobDescription,
  parseJobDescription,
  validateAgentName,
} from "@houston/domain";
// ===== Kernel =========================================================
export {
  type AuthExpiryNotifier,
  createAuthExpiryNotifier,
  isUnauthorized,
  TOKEN_EXPIRED_EVENT,
} from "./auth-expiry";
export type {
  CommandEnvelope,
  CommandHandler,
  CommandResult,
} from "./commands";
export { CommandRegistry, isCommandEnvelope } from "./commands";
// ===== Module contracts ===============================================
// Each module's view-model types, scope helpers and command constants — the
// surface a consumer subscribes to and dispatches — grouped by what they are
// about. `create<Name>Module` factories stay internal: the kernel composes
// them, and a host uses `new HoustonSdk(...)`.
export * from "./contracts-account";
export * from "./contracts-agent";
export * from "./contracts-conversation";
export * from "./local-model-bridge";
export type { ModuleContext } from "./module-context";
export * from "./modules/plan/announcement-model";
export * from "./modules/plan/billing-model";
// The rules around a skill still being built in chat: what counts as one,
// which is picked back up, which are listed, and discarding one.
export {
  type CreateChatStart,
  type DraftResume,
  discardDraftThenRestart,
  findDraftSkillChatActivities,
  isSkillSetupMode,
  resolveCreateChatStart,
  resolveDraftResume,
  SKILL_SETUP_AGENT_MODE,
  type SkillDraftActivity,
  type SkillDraftClaim,
  skillDraftLastWorkedAt,
  unfinishedDraftRows,
} from "./modules/skills/drafts";
export {
  createSkillDraftWrites,
  type SkillDraftActivityWrites,
  type SkillDraftWrites,
} from "./modules/skills/drafts-writes";
export type {
  Clock,
  KeyValueStore,
  LogFields,
  SdkConfig,
  SdkLogger,
  SdkPorts,
} from "./ports";
export { HoustonSdk } from "./sdk";
export type { EventListener, SdkEvent, SnapshotListener } from "./store";
export { ScopeStore } from "./store";
