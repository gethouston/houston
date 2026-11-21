import { assistantUnservedEnv } from "@houston/domain/assistant-deployment";
import { type AssistantRuntimeRole, assistantRoleEnv } from "./assistant-role";

export interface RuntimeSpawnEnvInput {
  systemPrompt?: string;
  sidecarBinary?: string;
  transcriptDualWrite: boolean;
  shutdownDrainMs?: number;
  assistantRole: AssistantRuntimeRole | null;
  unservedOperations: readonly string[];
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
    HOUSTON_TRANSCRIPT_DUAL_WRITE: input.transcriptDualWrite ? "1" : "",
    ...assistantRoleEnv(input.assistantRole),
    ...assistantUnservedEnv(
      input.assistantRole ? input.unservedOperations : [],
    ),
  };
}
