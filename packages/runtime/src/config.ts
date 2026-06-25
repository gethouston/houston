import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const env = process.env;

const host = env.HOUSTON_HOST || "127.0.0.1";

/** Loopback addresses — browser and runtime must be co-located to reach these. */
function isLoopbackHost(h: string): boolean {
  const v = h
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return v === "127.0.0.1" || v === "localhost" || v === "::1";
}

/**
 * Headless = no usable loopback between the user's browser and the runtime, so
 * Claude's loopback OAuth can't catch its redirect. Explicit `HOUSTON_HEADLESS`
 * wins; otherwise inferred from a non-loopback bind host.
 */
function isHeadless(): boolean {
  const flag = env.HOUSTON_HEADLESS;
  if (flag === undefined || flag === "") return !isLoopbackHost(host);
  return /^(1|true|yes|on)$/i.test(flag);
}

/**
 * One houston-runtime instance = one workspace (a single working directory).
 * Everything is single-user; there is no workspace management here.
 */
export const config = {
  /** The working directory the agent operates in. */
  workspaceDir: env.HOUSTON_WORKSPACE_DIR || process.cwd(),
  /** Where auth.json + per-conversation session JSONL live. */
  dataDir:
    env.HOUSTON_DATA_DIR ||
    join(env.HOUSTON_HOME || join(homedir(), ".houston-ts"), "data"),
  host,
  port: Number(env.HOUSTON_PORT || 4317),
  /** Use the headless OAuth flows (Claude via copy-paste code, no loopback). */
  headless: isHeadless(),
  /** Default Anthropic model (Claude Pro/Max subscription). */
  model: env.HOUSTON_MODEL || "claude-sonnet-4-6",
  /** Default Codex model (ChatGPT subscription — the cloud's only provider). */
  codexModel: env.HOUSTON_CODEX_MODEL || "gpt-5.5",
  /**
   * Default GitHub Copilot model (subscription OAuth). A pi-ai `github-copilot`
   * model id — note Copilot's ids use dots (`claude-sonnet-4.6`), unlike the
   * native Anthropic provider's dashes (`claude-sonnet-4-6`).
   */
  githubCopilotModel: env.HOUSTON_GITHUB_COPILOT_MODEL || "claude-sonnet-4.6",
  /** Default Google Gemini model (API-key provider). A pi-ai `google` model id. */
  geminiModel: env.HOUSTON_GEMINI_MODEL || "gemini-3-flash-preview",
  /** Default Amazon Bedrock model (API-key provider). A pi-ai `amazon-bedrock` model id. */
  bedrockModel: env.HOUSTON_BEDROCK_MODEL || "anthropic.claude-sonnet-4-6",
  /** Default OpenRouter model (API-key provider). A pi-ai `openrouter` model id. */
  openrouterModel:
    env.HOUSTON_OPENROUTER_MODEL || "anthropic/claude-sonnet-4.6",
  /** Default OpenCode Zen model (pay-as-you-go curated gateway, API key). */
  opencodeModel: env.HOUSTON_OPENCODE_MODEL || "claude-sonnet-4-6",
  /** Default OpenCode Go model ($10/mo open-model gateway, API key). */
  opencodeGoModel: env.HOUSTON_OPENCODE_GO_MODEL || "glm-5.1",
  /**
   * Assumed context window (tokens) for an OpenAI-compatible (local) model when
   * the user doesn't specify one. Local servers (Ollama/vLLM/LM Studio) don't
   * advertise a window pi can read, so this is the denominator the context
   * indicator starts with; the user can override it per endpoint.
   */
  openaiCompatibleContextWindow: Number(
    env.HOUSTON_OPENAI_COMPATIBLE_CONTEXT_WINDOW || 32768,
  ),

  /**
   * Override for the skills directory. Default is <workspace>/.agents/skills —
   * the Agent Skills standard (SKILL.md folders), the same layout Houston has
   * always kept on disk. An absent directory simply means no skills.
   */
  skillsDirOverride: env.HOUSTON_SKILLS_DIR || "",
  /** Product system prompt injected by the host/app. Empty = built-in default. */
  systemPrompt: env.HOUSTON_SYSTEM_PROMPT || "",

  /**
   * Server mode. "server" (default) = the long-lived per-workspace HTTP server.
   * "turn" = the stateless per-turn cloud runtime: POST /turn hydrates the
   * agent's object-storage prefix, runs one pi turn, syncs back, wipes.
   */
  mode: env.HOUSTON_MODE === "turn" ? ("turn" as const) : ("server" as const),
  /** App-layer token the control plane presents in X-Internal-Token (turn mode). */
  turnToken: env.HOUSTON_TURN_TOKEN || "",
  /** GCS bucket holding workspaces (turn mode, production). */
  gcsBucket: env.HOUSTON_GCS_BUCKET || "",
  /** Local directory standing in for the bucket (turn mode, dev/tests). */
  localStoreDir: env.HOUSTON_LOCAL_STORE_DIR || "",
  /** Optional bearer token. Empty = no auth (local dev on loopback). */
  token: env.HOUSTON_RUNTIME_TOKEN || "",
  /** Allowed CORS origin for the webapp. "*" (default) or an explicit origin. */
  corsOrigin: env.HOUSTON_CORS_ORIGIN || "*",

  /**
   * Connect-once (the ONE cloud credential model): the user's subscription
   * credential lives centrally in the control plane; this sandbox pulls a
   * short-TTL access token per turn, authenticated by the control-plane-issued
   * sandbox token. There is no keyless proxy and no org API key.
   */
  sandboxToken: env.HOUSTON_SANDBOX_TOKEN || "",
  /** Where the sandbox fetches its workspace's central subscription token. */
  controlPlaneUrl: env.HOUSTON_CONTROL_PLANE_URL || "",

  /**
   * Remote code-execution sandbox (Cloud Run). When set, the agent runs code
   * THERE via the `run_code` tool instead of holding a local `bash` tool: the
   * agent process stays cheap and untrusted code executes in a disposable,
   * isolated box rented per task. Empty on desktop, where pi keeps in-process
   * bash. See packages/code-sandbox + cloud/code-execution.md.
   */
  codeSandboxUrl: env.HOUSTON_CODE_SANDBOX_URL || "",
  /** App-layer token presented to the code sandbox via X-Sandbox-Token. */
  codeSandboxToken: env.HOUSTON_CODE_SANDBOX_TOKEN || "",
  /** Per-workspace run_code budget (Gate #5: one tenant must not saturate the fleet). */
  runCodeMaxConcurrent: Number(env.HOUSTON_RUN_CODE_MAX_CONCURRENT || 2),
  runCodePerMinute: Number(env.HOUSTON_RUN_CODE_PER_MINUTE || 10),

  version: "0.0.0",
};

mkdirSync(config.dataDir, { recursive: true });
mkdirSync(join(config.dataDir, "sessions"), { recursive: true });
// The agent's working directory must exist before pi opens it as the bash/ls cwd,
// or every file tool reports "Path not found". On a fresh PVC it does not yet.
mkdirSync(config.workspaceDir, { recursive: true });
