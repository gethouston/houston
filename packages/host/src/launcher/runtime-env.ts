import type { AssistantGateway } from "../routes/assistant-forward";
import { assistantRuntimeEnv } from "../routes/assistant-wiring";

/**
 * The extra environment EVERY runtime this host spawns inherits — assembled
 * here, and pure, so what a child process is told is unit-testable without
 * spawning one. The per-runtime values (workspace dir, data dir, port, tokens)
 * stay with the launcher, which knows the agent; these are host-wide.
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
   * Where Houston operations are performed, from the ONE resolver
   * (`routes/assistant-wiring.ts`). Passing it down is what makes the assistant
   * tool family visible to the runtime: the runtime's `assistantEnabled` reads
   * this pair's PRESENCE, so host and runtime cannot disagree about whether the
   * family is on. Null → neither variable is set and the runtime offers no
   * assistant tools.
   */
  assistant: AssistantGateway | null;
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
    ...assistantRuntimeEnv(input.assistant),
  };
}
