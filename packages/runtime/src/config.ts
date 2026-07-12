import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const env = process.env;

const host = env.HOUSTON_HOST || "127.0.0.1";

function codeExecutionMode(): "local" | "remote" | "disabled" {
  const raw = env.HOUSTON_CODE_EXECUTION?.trim().toLowerCase();
  if (raw) {
    if (raw !== "local" && raw !== "remote" && raw !== "disabled") {
      throw new Error(
        "HOUSTON_CODE_EXECUTION must be local, remote, or disabled",
      );
    }
    if (raw === "remote" && !env.HOUSTON_CODE_SANDBOX_URL) {
      throw new Error(
        "HOUSTON_CODE_EXECUTION=remote requires HOUSTON_CODE_SANDBOX_URL",
      );
    }
    return raw;
  }
  return env.HOUSTON_CODE_SANDBOX_URL ? "remote" : "local";
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
  /** Default Anthropic model (Claude Pro/Max subscription). */
  model: env.HOUSTON_MODEL || "claude-sonnet-5",
  /** Default Codex model (ChatGPT subscription — the cloud's only provider). */
  codexModel: env.HOUSTON_CODEX_MODEL || "gpt-5.5",
  /**
   * Default GitHub Copilot model (subscription OAuth). A pi-ai `github-copilot`
   * model id — note Copilot's ids use dots (`gpt-4.1`), unlike the native
   * Anthropic provider's dashes (`claude-sonnet-4-6`).
   *
   * `gpt-4.1` is a BASE model every Copilot plan serves, including Copilot Free.
   * Premium models (Claude, GPT-5.x) require Copilot Pro and answer
   * `model_not_supported` on Free — defaulting to one stranded every Free user
   * (HOU-578). Pro users can still switch up to Claude in the picker. Keep in
   * sync with `COPILOT_BASE_FALLBACK` in `ai/provider-error.ts`.
   */
  githubCopilotModel: env.HOUSTON_GITHUB_COPILOT_MODEL || "gpt-4.1",
  /** Default Google Gemini model (API-key provider). A pi-ai `google` model id. */
  geminiModel: env.HOUSTON_GEMINI_MODEL || "gemini-3-flash-preview",
  /** Default Amazon Bedrock model (API-key provider). A pi-ai `amazon-bedrock` model id. */
  bedrockModel: env.HOUSTON_BEDROCK_MODEL || "anthropic.claude-sonnet-4-6",
  /** Default MiniMax global model (API-key provider). A pi-ai `minimax` model id. */
  minimaxModel: env.HOUSTON_MINIMAX_MODEL || "MiniMax-M3",
  /** Default OpenRouter model (API-key provider). A pi-ai `openrouter` model id. */
  openrouterModel:
    env.HOUSTON_OPENROUTER_MODEL || "anthropic/claude-sonnet-4.6",
  /** Default DeepSeek model (API-key provider). A pi-ai `deepseek` model id. */
  deepseekModel: env.HOUSTON_DEEPSEEK_MODEL || "deepseek-v4-flash",
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
   * Code execution policy for long-lived runtime:
   * - local: clamped file tools + built-in bash
   * - remote: clamped file tools + run_code via HOUSTON_CODE_SANDBOX_URL
   * - disabled: clamped file tools only
   *
   * Default preserves old behavior: sandbox URL => remote, no URL => local.
   */
  codeExecution: codeExecutionMode(),
  /**
   * Remote code-execution sandbox (Cloud Run). Used only when codeExecution is
   * "remote"; managed hosted pods run bash in-container (HOUSTON_CODE_EXECUTION=local).
   */
  codeSandboxUrl: env.HOUSTON_CODE_SANDBOX_URL || "",
  /** App-layer token presented to the code sandbox via X-Sandbox-Token. */
  codeSandboxToken: env.HOUSTON_CODE_SANDBOX_TOKEN || "",
  /** Per-workspace run_code budget (Gate #5: one tenant must not saturate the fleet). */
  runCodeMaxConcurrent: Number(env.HOUSTON_RUN_CODE_MAX_CONCURRENT || 2),
  runCodePerMinute: Number(env.HOUSTON_RUN_CODE_PER_MINUTE || 10),

  /**
   * How long a turn's model request may go with NO activity — no wire event,
   * while no tool is running — before the runtime treats the provider as stalled,
   * aborts it, and surfaces a typed error. A healthy turn streams text/thinking/
   * tool events continuously; a stalled provider stream (a chatgpt.com SSE read
   * that never returns another byte) emits nothing and, absent this, holds the
   * per-workspace turn lock until the OS socket dies (19 min observed in prod;
   * pi's SSE reader has no idle timeout, only its WebSocket path does).
   * Defaults to pi's own 5-minute idle default, deliberately generous so it never
   * clips a long-reasoning turn that streams no intermediate events; ops can lower
   * it. `0` disables the watchdog. Non-finite/negative also disable (fail-safe:
   * no false aborts). Tool execution is exempt — a long bash/build is silent.
   */
  turnStallTimeoutMs: Number(env.HOUSTON_TURN_STALL_TIMEOUT_MS || 300_000),

  /**
   * Max live agent sessions kept hot in the in-memory conversation cache. Each
   * cached session holds a backend session (pi/Claude) with its own in-memory
   * transcript, so an unbounded cache grows without limit over a long-lived
   * process. Past this bound the least-recently-used SETTLED session is disposed;
   * it re-hydrates transparently from its on-disk transcript on the next turn (a
   * session with a queued/running turn is never evicted). Ops can tune it.
   */
  sessionCacheMax: Number(env.HOUSTON_SESSION_CACHE_MAX || 40),
  /**
   * How long a settled session may sit idle before it is disposed (ms), even
   * under the {@link sessionCacheMax} bound — reclaims memory for conversations
   * a user walked away from. Re-hydrated from disk on next access. `0` (or a
   * non-positive value) disables idle eviction, leaving only the size bound.
   */
  sessionCacheIdleMs: Number(env.HOUSTON_SESSION_CACHE_IDLE_MS || 1_800_000),

  version: "0.0.0",
};

mkdirSync(config.dataDir, { recursive: true });
mkdirSync(join(config.dataDir, "sessions"), { recursive: true });
// The agent's working directory must exist before pi opens it as the bash/ls cwd,
// or every file tool reports "Path not found". On a fresh PVC it does not yet.
mkdirSync(config.workspaceDir, { recursive: true });
