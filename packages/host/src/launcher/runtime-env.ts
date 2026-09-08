import { type AssistantRuntimeRole, assistantRoleEnv } from "./assistant-role";

/**
 * The extra environment a runtime this host spawns inherits — assembled here,
 * and pure, so what a child process is told is unit-testable without spawning
 * one. The per-runtime values (workspace dir, data dir, port, tokens) stay with
 * the launcher, which knows the agent.
 */
export interface RuntimeSpawnEnvInput {
  /** Product system prompt the app injects into every runtime (voice rules). */
  systemPrompt?: string;
  /**
   * Set when THIS process is the compiled sidecar binary
   * (`process.env.HOUSTON_SIDECAR_BINARY`): the packaged runtime command
   * re-spawns the same binary, so the child must be told to dispatch into the
   * RUNTIME role (`sidecar-entry.ts` reads it). The dev `tsx <source>` command
   * ignores it harmlessly.
   */
  sidecarBinary?: string;
  /** True only when this host built its pod-auth transcript facade. */
  transcriptDualWrite: boolean;
  /** Runtime-side graceful-drain budget (ms); the host's SIGKILL escalation
      is the backstop, not the norm. Absent = runtime default. */
  shutdownDrainMs?: number;
  /**
   * The role of the ONE runtime this environment is for, from the host's own
   * decision (`launcher/assistant-role.ts`): "coordinator" for the user's
   * personal assistant, null for every ordinary agent. It is the whole of what
   * a runtime is told about the assistant — the gateway URL and the gateway
   * token stay with the host's dispatcher, which is what holds the credential
   * that authorizes account-wide Houston operations.
   */
  assistantRole: AssistantRuntimeRole | null;
}

export function runtimeSpawnEnv(
  input: RuntimeSpawnEnvInput,
): Record<string, string> {
  return {
    ...(input.systemPrompt
      ? { HOUSTON_SYSTEM_PROMPT: input.systemPrompt }
      : {}),
    ...(input.sidecarBinary ? { HOUSTON_SIDECAR_ROLE: "runtime" } : {}),
    ...(input.shutdownDrainMs !== undefined
      ? { HOUSTON_RUNTIME_DRAIN_MS: String(input.shutdownDrainMs) }
      : {}),
    // Do not inherit a rollout flag into a runtime unless the host also
    // constructed its pod-auth facade from the complete managed config.
    HOUSTON_TRANSCRIPT_DUAL_WRITE: input.transcriptDualWrite ? "1" : "",
    ...assistantRoleEnv(input.assistantRole),
  };
}
