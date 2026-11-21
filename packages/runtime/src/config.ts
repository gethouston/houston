import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type AssistantRuntimeRole,
  readAssistantRole,
} from "@houston/domain/assistant-role";
import { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
import { CODEX_DEFAULT_MODEL } from "./ai/codex-offered";
import { parseToolShell } from "./tool-shell-config";

const env = process.env;

const host = env.HOUSTON_HOST || "127.0.0.1";

function defaultModel(provider: string): string {
  const model = DEFAULT_MODEL[provider];
  if (model === undefined)
    throw new Error(`no default model for provider: ${provider}`);
  return model;
}

const turnMode = env.HOUSTON_MODE === "turn";

function codeExecutionMode(): "local" | "remote" | "disabled" {
  const raw = env.HOUSTON_CODE_EXECUTION?.trim().toLowerCase();
  if (raw) {
    if (raw !== "local" && raw !== "remote" && raw !== "disabled") {
      throw new Error(
        "HOUSTON_CODE_EXECUTION must be local, remote, or disabled",
      );
    }
    if (raw === "remote" && !turnMode && !env.HOUSTON_CODE_SANDBOX_URL) {
      throw new Error(
        "HOUSTON_CODE_EXECUTION=remote requires HOUSTON_CODE_SANDBOX_URL",
      );
    }
    return raw;
  }
  return env.HOUSTON_CODE_SANDBOX_URL ? "remote" : "local";
}

const assistantRole: AssistantRuntimeRole | null = readAssistantRole(env);

const hostReachable = Boolean(
  env.HOUSTON_CONTROL_PLANE_URL?.trim() && env.HOUSTON_SANDBOX_TOKEN?.trim(),
);

function stallTimeoutMs(raw: string | undefined, fallbackMs: number): number {
  return raw === undefined || raw.trim() === "" ? fallbackMs : Number(raw);
}

export const config = {
  workspaceDir: env.HOUSTON_WORKSPACE_DIR || process.cwd(),
  dataDir:
    env.HOUSTON_DATA_DIR ||
    join(env.HOUSTON_HOME || join(homedir(), ".houston-ts"), "data"),
  host,
  port: Number(env.HOUSTON_PORT || 4317),
  shutdownDrainMs: Math.max(0, Number(env.HOUSTON_RUNTIME_DRAIN_MS || 3000)),
  model: env.HOUSTON_MODEL || defaultModel("anthropic"),
  codexModel: env.HOUSTON_CODEX_MODEL || CODEX_DEFAULT_MODEL,
  githubCopilotModel:
    env.HOUSTON_GITHUB_COPILOT_MODEL || defaultModel("github-copilot"),
  geminiModel: env.HOUSTON_GEMINI_MODEL || defaultModel("google"),
  bedrockModel: env.HOUSTON_BEDROCK_MODEL || defaultModel("amazon-bedrock"),
  minimaxModel: env.HOUSTON_MINIMAX_MODEL || defaultModel("minimax"),
  openrouterModel: env.HOUSTON_OPENROUTER_MODEL || defaultModel("openrouter"),
  deepseekModel: env.HOUSTON_DEEPSEEK_MODEL || defaultModel("deepseek"),
  opencodeModel: env.HOUSTON_OPENCODE_MODEL || defaultModel("opencode"),
  opencodeGoModel: env.HOUSTON_OPENCODE_GO_MODEL || defaultModel("opencode-go"),
  openaiCompatibleContextWindow: Number(
    env.HOUSTON_OPENAI_COMPATIBLE_CONTEXT_WINDOW || 32768,
  ),

  skillsDirOverride: env.HOUSTON_SKILLS_DIR || "",
  sharedSkillsDir: env.HOUSTON_SHARED_SKILLS_DIR || "",
  systemPrompt: env.HOUSTON_SYSTEM_PROMPT || "",

  mode: turnMode ? ("turn" as const) : ("server" as const),
  turnToken: env.HOUSTON_TURN_TOKEN || "",
  gcsBucket: env.HOUSTON_GCS_BUCKET || "",
  localStoreDir: env.HOUSTON_LOCAL_STORE_DIR || "",
  token: env.HOUSTON_RUNTIME_TOKEN || "",
  corsOrigin: env.HOUSTON_CORS_ORIGIN || "*",

  sandboxToken: env.HOUSTON_SANDBOX_TOKEN || "",
  controlPlaneUrl: env.HOUSTON_CONTROL_PLANE_URL || "",
  transcriptDualWrite: env.HOUSTON_TRANSCRIPT_DUAL_WRITE === "1",

  assistantRole,
  assistantEnabled: assistantRole === "coordinator" && hostReachable,
  codeExecution: codeExecutionMode(),
  poolSingleUse: env.HOUSTON_POOL_SINGLE_USE === "1",
  podUid: env.HOUSTON_POD_UID ?? "",
  codeSandboxUrl: env.HOUSTON_CODE_SANDBOX_URL || "",
  codeSandboxToken: env.HOUSTON_CODE_SANDBOX_TOKEN || "",
  runCodeMaxConcurrent: Number(env.HOUSTON_RUN_CODE_MAX_CONCURRENT || 2),
  runCodePerMinute: Number(env.HOUSTON_RUN_CODE_PER_MINUTE || 10),
  toolShell: parseToolShell(env.HOUSTON_TOOL_SHELL),

  turnStallTimeoutMs: stallTimeoutMs(
    env.HOUSTON_TURN_STALL_TIMEOUT_MS,
    600_000,
  ),
  turnFirstByteDeadlineMs: stallTimeoutMs(
    env.HOUSTON_TURN_FIRST_BYTE_DEADLINE_MS,
    15_000,
  ),

  sessionCacheMax: Number(env.HOUSTON_SESSION_CACHE_MAX || 8),
  sessionCacheIdleMs: Number(env.HOUSTON_SESSION_CACHE_IDLE_MS || 1_800_000),
  conversationParseCacheBytes:
    Number(env.HOUSTON_CONVERSATION_PARSE_CACHE_MB || 64) * 1024 * 1024,

  engineMemoryReserveBytes:
    Number(env.HOUSTON_ENGINE_MEMORY_RESERVE_MB || 1280) * 1024 * 1024,

  version: "0.0.0",
};

mkdirSync(config.dataDir, { recursive: true });
mkdirSync(join(config.dataDir, "sessions"), { recursive: true });
mkdirSync(config.workspaceDir, { recursive: true });
