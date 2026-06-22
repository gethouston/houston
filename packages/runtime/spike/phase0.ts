/**
 * Phase 0 de-risk spike for the Houston TS engine built on pi-coding-agent.
 *
 * Verifies, with ZERO credentials/network by default:
 *   1. The barrel imports headless (non-TTY) without side effects.
 *   2. createAgentSession constructs headless with discovery DISABLED + our own system prompt.
 *   3. A FULL agent turn runs via the faux provider: text streaming + tool execution + agent_end.
 *   4. The AgentSessionEvent stream shape we'll wrap for SSE.
 *
 * Optional (guarded):
 *   - SPIKE_OAUTH=1   exercises the Codex device-code login headless (network; aborts after capturing the code).
 *   - ANTHROPIC_API_KEY / OPENAI_API_KEY present -> runs a real one-shot turn.
 */

import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  DefaultResourceLoader,
} from "@earendil-works/pi-coding-agent";
import {
  registerFauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
  getModel,
} from "@earendil-works/pi-ai";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";

const log = (...a: unknown[]) => console.log(...a);
const section = (t: string) => log(`\n=== ${t} ===`);

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`timeout(${ms}ms): ${label}`)), ms),
    ),
  ]);
}

/** Minimal headless ResourceLoader: no discovery, just our system prompt. */
function makeHeadlessLoader(cwd: string, systemPrompt: string) {
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: cwd,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt,
  } as any);
  return loader;
}

async function runFauxTurn(opts: {
  label: string;
  responses: any[];
  prompt: string;
  tools: string[];
}) {
  section(opts.label);
  const cwd = mkdtempSync(join(tmpdir(), "houston-spike-"));

  // Register an in-process fake model provider — no network, scripted responses.
  const faux = registerFauxProvider({
    provider: "faux",
    api: "faux",
    models: [
      { id: "faux-1", name: "Faux 1", contextWindow: 200000, maxTokens: 8192 },
    ],
  });
  faux.setResponses(opts.responses);

  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey("faux", "faux-key"); // faux ignores it; satisfies the pre-flight auth gate
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const sessionManager = SessionManager.inMemory(cwd);
  const resourceLoader = makeHeadlessLoader(
    cwd,
    "You are Houston, a helpful agent.",
  );
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    model: faux.getModel() as any,
    authStorage,
    modelRegistry,
    sessionManager,
    resourceLoader: resourceLoader as any,
    tools: opts.tools,
  });

  const seen: string[] = [];
  let textOut = "";
  const unsub = session.subscribe((event: any) => {
    seen.push(event.type);
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent?.type === "text_delta"
    ) {
      textOut += event.assistantMessageEvent.delta ?? "";
    }
    if (event.type === "tool_execution_start") {
      log(
        `  • tool_execution_start: ${event.toolName} ${JSON.stringify(event.args ?? {})}`,
      );
    }
    if (event.type === "tool_execution_end") {
      log(
        `  • tool_execution_end:   ${event.toolName} isError=${event.isError}`,
      );
    }
  });

  await withTimeout(session.prompt(opts.prompt), 30000, opts.label);
  unsub();
  session.dispose();
  faux.unregister();

  // Summarize the event stream we observed.
  const counts: Record<string, number> = {};
  for (const t of seen) counts[t] = (counts[t] ?? 0) + 1;
  log("  event types:", JSON.stringify(counts));
  log("  assistant text:", JSON.stringify(textOut.slice(0, 200)));
  return { counts, textOut };
}

async function probeCodexDeviceCode() {
  section(
    "Codex device-code login (headless probe; aborts after capturing code)",
  );
  const { loginOpenAICodexDeviceCode } = await import(
    "@earendil-works/pi-ai/oauth"
  );
  const ac = new AbortController();
  try {
    await loginOpenAICodexDeviceCode({
      signal: ac.signal,
      onDeviceCode: (info: any) => {
        log("  ✓ device code issued:");
        log("    verificationUri:", info.verificationUri);
        log("    userCode:", info.userCode);
        log("  (aborting — not waiting for user authorization)");
        ac.abort();
      },
    });
  } catch (e: any) {
    log(
      "  login ended:",
      e?.message ?? String(e),
      "(expected: aborted after capturing code)",
    );
  }
}

async function liveTurnIfCreds() {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  if (!hasAnthropic && !hasOpenAI) {
    section(
      "Live LLM turn — SKIPPED (no ANTHROPIC_API_KEY / OPENAI_API_KEY in env)",
    );
    return;
  }
  section("Live LLM turn");
  const cwd = mkdtempSync(join(tmpdir(), "houston-spike-live-"));
  const authStorage = AuthStorage.inMemory();
  const provider = hasAnthropic ? "anthropic" : "openai";
  const key = hasAnthropic
    ? process.env.ANTHROPIC_API_KEY!
    : process.env.OPENAI_API_KEY!;
  authStorage.setRuntimeApiKey(provider, key);
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const model = hasAnthropic
    ? getModel("anthropic", "claude-opus-4-5" as any)
    : getModel("openai", "gpt-5.1-codex" as any);
  const resourceLoader = makeHeadlessLoader(
    cwd,
    "You are Houston. Answer in one short sentence.",
  );
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    model: model as any,
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(cwd),
    resourceLoader: resourceLoader as any,
    tools: ["read", "ls", "bash"],
  });
  let text = "";
  const unsub = session.subscribe((e: any) => {
    if (
      e.type === "message_update" &&
      e.assistantMessageEvent?.type === "text_delta"
    )
      text += e.assistantMessageEvent.delta ?? "";
  });
  await withTimeout(
    session.prompt("Say hello and tell me what model you are in one sentence."),
    60000,
    "live",
  );
  unsub();
  session.dispose();
  log("  live answer:", JSON.stringify(text.slice(0, 300)));
}

async function main() {
  section("1. Barrel imported headless");
  log("  createAgentSession:", typeof createAgentSession);

  // 2 + 3 + 4: full headless turn, text-only.
  await runFauxTurn({
    label: "2. Headless faux turn — text only",
    prompt: "Hi there.",
    tools: ["read", "ls", "bash"],
    responses: [
      fauxAssistantMessage("Hello from the faux model. The loop works.", {
        stopReason: "stop",
      }),
    ],
  });

  // Tool execution path: scripted tool call, then a final answer.
  await runFauxTurn({
    label: "3. Headless faux turn — tool call then answer",
    prompt: "List the files in this directory.",
    tools: ["read", "ls", "bash"],
    responses: [
      fauxAssistantMessage([fauxToolCall("ls", { path: "." })], {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage("I listed the directory.", { stopReason: "stop" }),
    ],
  });

  if (process.env.SPIKE_OAUTH === "1") await probeCodexDeviceCode();
  else section("Codex device-code probe — SKIPPED (set SPIKE_OAUTH=1 to run)");

  await liveTurnIfCreds();

  section("DONE — Phase 0 spike complete");
}

main().catch((e) => {
  console.error("\nSPIKE FAILED:", e);
  process.exit(1);
});
