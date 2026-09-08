/**
 * Host credentials and deployment controls never belong to a runtime.
 *
 * The child env is the parent's MINUS {@link HOST_ONLY}, so a secret the host
 * was given cannot reach a model-directed process by inheritance: a managed
 * assistant pod carries the gateway credential that acts on the whole account
 * (`HOUSTON_ASSISTANT_TOKEN` + `HOUSTON_ASSISTANT_CP_URL`), and the role a
 * runtime is told is stamped per-spawn from the host's own decision
 * (`assistant-role.ts`) rather than inherited, so an ordinary agent on that pod
 * can never read itself as the coordinator.
 *
 * WHY A DENYLIST, with a guard: the runtime and the model stack under it read
 * environment this package cannot enumerate — every provider key, the proxy and
 * certificate variables a corporate network needs, PATH, HOME, the locale. An
 * allowlist would silently strip the next one and break an agent in a way no
 * test here could see. What CAN be enumerated is the other half: every
 * `HOUSTON_*` / `COMPOSIO_*` name the host itself reads. So each one is
 * classified exactly once — host-only below, or {@link RUNTIME_PASS_THROUGH} —
 * and `runtime-parent-env.source.test.ts` fails the build on a name that is
 * neither, which is what keeps the next host-only secret from defaulting to
 * "inherited".
 */
export const HOST_ONLY: ReadonlySet<string> = new Set([
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
  // Managed-pod object-store tuning, read by the host's own sync loop
  // (local/managed-store-config.ts) and meaningless inside a runtime.
  "HOUSTON_HYDRATE_MAX_MB",
  "HOUSTON_STORE_SYNC_QUIET_MS",
  "HOUSTON_STORE_SYNC_INTERVAL_MS",
  // Host-side service endpoints and dev seams.
  "HOUSTON_AGENTSTORE_API_URL",
  "HOUSTON_FAKE_ENGINE_URL",
  // Stamped per-spawn by `runtime-env.ts` from the host's own construction, so
  // inheriting either would let a stale parent value outrank the decision.
  "HOUSTON_SIDECAR_ROLE",
  "HOUSTON_TRANSCRIPT_DUAL_WRITE",
  // The desktop supervisor's marker for the HOST process: it arms the
  // parent-watchdog, which a runtime must never arm for itself.
  "HOUSTON_SUPERVISED",
]);

/**
 * Host-read names a runtime is DELIBERATELY given, each because the runtime
 * reads it too. Kept as a list rather than a comment so the source guard can
 * tell "decided to pass through" from "nobody looked at it yet".
 */
export const RUNTIME_PASS_THROUGH: ReadonlySet<string> = new Set([
  // A path, not a credential: the runtime resolves the SHARED Claude credential
  // directory from it (`backends/claude/paths.ts` →
  // `<HOUSTON_HOME>/claude-login`, the same dir the desktop's `claude auth
  // login` writes). Withholding it would send every agent to `~/.houston-ts`
  // and break the one login that connects them all.
  "HOUSTON_HOME",
  // Set by the compiled sidecar entry for itself and read by the runtime to
  // name its deployment in error reports
  // (`@houston/runtime-client` sentry/activation.ts).
  "HOUSTON_SIDECAR_BINARY",
  // A deployment flag, not a credential: the runtime's error reports name
  // their deployment from it (`@houston/runtime-client` engineDeployment), so
  // a managed pod's runtime reports `managed-cloud`, never `dev`.
  "HOUSTON_MANAGED_CLOUD",
]);

export function runtimeParentEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(parent).filter(([key]) => !HOST_ONLY.has(key)),
  );
}
