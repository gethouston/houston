import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type AssistantRuntimeRole,
  readAssistantRole,
} from "@houston/domain/assistant-role";
import { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
import { CODEX_DEFAULT_MODEL } from "./ai/codex-offered";

const env = process.env;

const host = env.HOUSTON_HOST || "127.0.0.1";

/**
 * A provider's default model, read from the ONE domain table
 * (`@houston/domain/provider-default-models`) — the same values the app's model
 * picker pre-selects and the on-disk migration lands an unplaceable stored model
 * on. Restating an id here is what let a turn run on one model while the table
 * that REWRITES user data named another, so nothing below spells one out.
 *
 * Throws for a provider the table does not carry: every id this file names is
 * curated, so a missing key means the table lost one — which must fail loudly at
 * boot rather than default a turn onto an empty model id.
 */
function defaultModel(provider: string): string {
  const model = DEFAULT_MODEL[provider];
  if (model === undefined)
    throw new Error(`no default model for provider: ${provider}`);
  return model;
}

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

const assistantRole: AssistantRuntimeRole | null = readAssistantRole(env);

/**
 * Whether this runtime can reach its host's `/sandbox/*` routes at all — the
 * same pair `session/sandbox-call.ts` builds its transport from, read here so
 * a tool family can be gated before the transport module is imported.
 */
const hostReachable = Boolean(
  env.HOUSTON_CONTROL_PLANE_URL?.trim() && env.HOUSTON_SANDBOX_TOKEN?.trim(),
);

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
  /**
   * How long a shutdown signal lets in-flight turns finish before the process
   * exits anyway. The host sets it from its own drain budget (a managed pod's
   * termination grace, minus the time its final store sync needs); the
   * desktop keeps the short default, where the app that owned this runtime is
   * already gone. Idle runtimes exit at once regardless.
   */
  shutdownDrainMs: Math.max(0, Number(env.HOUSTON_RUNTIME_DRAIN_MS || 3000)),
  /**
   * The per-provider default model: what a turn pinned to that provider with NO
   * model of its own runs on, overridable per deployment by env. Every VALUE —
   * and the evidence behind it — lives in the domain table `defaultModel` reads
   * (see above); this file only names which provider each env var overrides.
   */
  model: env.HOUSTON_MODEL || defaultModel("anthropic"),
  /**
   * Codex reads its default from `ai/codex-offered.ts` instead: that module
   * owns the live probe deciding which ids a ChatGPT subscription is actually
   * served, so this default has to move WITH the served set. It is not a second
   * value — `config.test.ts` and `app/tests/codex-models.test.ts` both pin it to
   * the domain table's `openai-codex` entry, so the two cannot diverge.
   */
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
  /** Read-only workspace-shared skills directory. Empty means unavailable. */
  sharedSkillsDir: env.HOUSTON_SHARED_SKILLS_DIR || "",
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
  /** File-authoritative transcript writes also enqueue the managed DB shadow. */
  transcriptDualWrite: env.HOUSTON_TRANSCRIPT_DUAL_WRITE === "1",

  /**
   * WHAT this runtime is. "coordinator" means it is the user's personal
   * assistant: it operates Houston and hands every piece of work to one of the
   * user's agents. null means an ordinary agent, which is every runtime on the
   * machine except that one.
   *
   * The HOST decides it and states it in `HOUSTON_ASSISTANT_ROLE`
   * (`launcher/assistant-role.ts`) because only the host knows which agent it
   * spawned: locally the coordinator is the synthetic `.assistant`, on a
   * managed pod it is an ordinarily-named agent under `/workspace`, so nothing
   * in this process's own directory can tell the two apart.
   */
  assistantRole,
  /**
   * The assistant tool family (`houston_capabilities` / `houston_describe` /
   * `houston_call`): performing user-facing Houston operations on the user's
   * whole account. Two gates, both required — this runtime IS the coordinator,
   * and it can reach its host (the family proxies to
   * `/sandbox/assistant/call`, which holds the gateway credential this process
   * deliberately never sees). An ordinary agent gets none of it, whatever else
   * is in its environment: the catalog reaches account-wide operations
   * (deleting agents, billing, team management) that only the user's own
   * assistant may perform on their behalf.
   */
  assistantEnabled: assistantRole === "coordinator" && hostReachable,
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
   * Single-use pool worker: this process serves exactly ONE claimed turn,
   * latches itself spent, and exits so the orchestrator replaces the whole pod
   * (fresh sandbox VM, fresh emptyDir). This is the ONLY configuration in
   * which a turn-mode worker may run local code execution: single-use makes
   * the pod single-tenant for its entire life, restoring the standing pod's
   * "the pod is the tenant boundary" justification.
   */
  poolSingleUse: env.HOUSTON_POOL_SINGLE_USE === "1",
  /**
   * This pod's OWN Kubernetes UID, from the downward API (metadata.uid), NOT
   * self-reported. The turn server rejects a dispatched turn whose X-Pool-Pod-UID
   * does not match this, so a REPLACEMENT pod that reused a prior incarnation's
   * ordinal+IP refuses a turn meant for that prior pod. Empty off-cluster (the
   * check is then not enforced). Reject-only: it can never admit or self-promote.
   */
  podUid: env.HOUSTON_POD_UID ?? "",
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

  /**
   * What the engine itself (this runtime, its host, a Claude CLI subprocess)
   * needs of the container's memory limit; the rest is the per-process cap on
   * anything the model spawns (session/child-memory-fence.ts). Sized from
   * production: an awake engine runs 0.7 to 1.5 GB resident before any user
   * workload. Only meaningful inside a memory-limited container.
   */
  engineMemoryReserveBytes:
    Number(env.HOUSTON_ENGINE_MEMORY_RESERVE_MB || 1280) * 1024 * 1024,

  version: "0.0.0",
};

mkdirSync(config.dataDir, { recursive: true });
mkdirSync(join(config.dataDir, "sessions"), { recursive: true });
// The agent's working directory must exist before pi opens it as the bash/ls cwd,
// or every file tool reports "Path not found". On a fresh PVC it does not yet.
mkdirSync(config.workspaceDir, { recursive: true });
