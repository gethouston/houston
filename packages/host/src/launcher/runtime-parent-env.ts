/**
 * Host credentials and deployment controls never belong to a runtime.
 *
 * The child env is the parent's MINUS this set, so a secret the host was given
 * cannot reach a model-directed process by inheritance: a managed assistant pod
 * carries the gateway credential that acts on the whole account
 * (`HOUSTON_ASSISTANT_TOKEN` + `HOUSTON_ASSISTANT_CP_URL`), and the role a
 * runtime is told is stamped per-spawn from the host's own decision
 * (`assistant-role.ts`) rather than inherited, so an ordinary agent on that pod
 * can never read itself as the coordinator.
 *
 * NOT here, deliberately: `HOUSTON_HOME`. It is a path, not a credential, and
 * the runtime resolves the SHARED Claude credential directory from it
 * (`backends/claude/paths.ts` → `<HOUSTON_HOME>/claude-login`, the same dir the
 * desktop's `claude auth login` writes and the Tauri shell derives). Withholding
 * it would send every agent to `~/.houston-ts` and break the one login that
 * connects them all.
 */
const HOST_ONLY = new Set([
  "COMPOSIO_API_KEY",
  "HOUSTON_WORKSPACES_ROOT",
  "HOUSTON_CREDENTIALS_PATH",
  "HOUSTON_AGENTS_DIR",
  "HOUSTON_CHAT_HISTORY_DB",
  "HOUSTON_HOST_PORT",
  "HOUSTON_HOST_BIND",
  "HOUSTON_HOST_TOKEN",
  "HOUSTON_MASTER_TOKEN",
  "HOUSTON_SHELL_TOKEN",
  "HOUSTON_CREDENTIALS_URL",
  "HOUSTON_ORG_SLUG",
  "HOUSTON_AGENT_SLUG",
  "HOUSTON_USER_ID",
  "HOUSTON_RUNTIME_COMMAND",
  "HOUSTON_APP_SYSTEM_PROMPT",
  "HOUSTON_MANAGED_CLOUD",
  "HOUSTON_SHUTDOWN_DRAIN_MS",
  "HOUSTON_OAUTH_CALLBACK_BASE_URL",
  "HOUSTON_PASSIVE",
  "HOUSTON_ROUTINE_SCHEDULER_MODE",
  "HOUSTON_STORE_URL",
  "HOUSTON_TURNLOG_URL",
  "HOUSTON_TURN_LOG",
  "HOUSTON_INTEGRATIONS_URL",
  "HOUSTON_EAGER_RUNTIME",
  "HOUSTON_LOOPBACK_EGRESS",
  "HOUSTON_ASSISTANT_ROLE",
  "HOUSTON_ASSISTANT_TOKEN",
  "HOUSTON_ASSISTANT_CP_URL",
  "HOUSTON_ASSISTANT_USER_ID",
  "HOUSTON_SANDBOX_TOKEN",
  "HOUSTON_RUNTIME_TOKEN",
  "HOUSTON_CONTROL_PLANE_URL",
  "HOUSTON_SHARED_SKILLS_DIR",
]);

export function runtimeParentEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(parent).filter(([key]) => !HOST_ONLY.has(key)),
  );
}
