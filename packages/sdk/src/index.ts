/**
 * `@houston/sdk` — the single headless Houston client.
 *
 * One client implementation under every surface (web, desktop, native). Reads
 * flow as scope snapshots; writes flow as commands. See README.md for the model.
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
// ===== Native bridge (dispatcher + wire vocabulary) ====================
// The JS-side dispatcher that implements `BRIDGE.md` for embedding hosts
// (iOS/JavaScriptCore, Android/Hermes). The self-contained IIFE bundle entry
// lives in `bridge/entry.ts` (built via `build:bridge`) and is NOT re-exported
// here because it installs global shims as an import side effect.
export {
  type Bridge,
  createBridge,
  type SdkFactory,
} from "./bridge/dispatcher";
export {
  BRIDGE_PROTOCOL_VERSION,
  type BridgeInbound,
  type BridgeLogLevel,
  type BridgeOutbound,
  type NativePorts,
  type SendFn,
} from "./bridge/wire";
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
