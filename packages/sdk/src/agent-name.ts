/**
 * Subpath re-export of the shared agent-name rule (`@houston/sdk/agent-name`).
 *
 * The main barrel also re-exports these, but this dependency-free subpath is
 * what surface code should import: it stays loadable under plain
 * `node --experimental-strip-types` (app unit tests), where the barrels'
 * extensionless internal imports do not resolve.
 */
export {
  AGENT_NAME_MAX_LENGTH,
  type AgentNameValidation,
  type InvalidAgentNameReason,
  validateAgentName,
} from "@houston/domain/agent-name";
