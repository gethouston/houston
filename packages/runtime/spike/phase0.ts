import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type FauxResponseStep,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  getModel,
} from "@earendil-works/pi-ai/compat";
import {
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

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
  });
  return loader;
}

async function runFauxTurn(opts: {
  label: string;
  responses: FauxResponseStep[];
  prompt: string;
  tools: string[];
}) {
  section(opts.label);
  const cwd = mkdtempSync(join(tmpdir(), "houston-spike-"));

  const faux = fauxProvider({
    provider: "faux",
    api: "faux",
    models: [
      { id: "faux-1", name: "Faux 1", contextWindow: 200000, maxTokens: 8192 },
    ],
  });
  faux.setResponses(opts.responses);

  writeFileSync(
    join(cwd, "auth.json"),
    JSON.stringify({ faux: { type: "api_key", key: "faux-key" } }),
    { mode: 0o600 },
  );
  const modelRuntime = await ModelRuntime.create({
    authPath: join(cwd, "auth.json"),
    modelsPath: join(cwd, "models.json"),
  });
  modelRuntime.registerNativeProvider(faux.provider);
  const sessionManager = SessionManager.inMemory(cwd);
  const resourceLoader = makeHeadlessLoader(
    cwd,
    "You are Houston, a helpful agent.",
  );
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    model: faux.getModel(),
    modelRuntime,
    sessionManager,
    resourceLoader,
    tools: opts.tools,
  });

  const seen: string[] = [];
  let textOut = "";
  const unsub = session.subscribe((event: AgentSessionEvent) => {
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
  const cwd = mkdtempSync(join(tmpdir(), "houston-spike-oauth-"));
  const runtime = await ModelRuntime.create({
    authPath: join(cwd, "auth.json"),
    modelsPath: join(cwd, "models.json"),
  });
  const ac = new AbortController();
  try {
    await runtime.login("openai-codex", "oauth", {
      signal: ac.signal,
      prompt: async (p) => {
        if (p.type === "select") return "device_code";
        return new Promise<string>(() => {});
      },
      notify: (event) => {
        if (event.type !== "device_code") return;
        log("  ✓ device code issued:");
        log("    verificationUri:", event.verificationUri);
        log("    userCode:", event.userCode);
        log("  (aborting — not waiting for user authorization)");
        ac.abort();
      },
    });
  } catch (e: unknown) {
    log(
      "  login ended:",
      e instanceof Error ? e.message : String(e),
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
  const provider = hasAnthropic ? "anthropic" : "openai";
  const key = hasAnthropic
    ? process.env.ANTHROPIC_API_KEY
    : process.env.OPENAI_API_KEY;
  if (!key)
    throw new Error(`Expected ${provider.toUpperCase()}_API_KEY to be set`);
  writeFileSync(
    join(cwd, "auth.json"),
    JSON.stringify({ [provider]: { type: "api_key", key } }),
    { mode: 0o600 },
  );
  const modelRuntime = await ModelRuntime.create({
    authPath: join(cwd, "auth.json"),
    modelsPath: join(cwd, "models.json"),
  });
  const getModelDynamic = getModel as (
    provider: string,
    modelId: string,
  ) => ReturnType<typeof getModel>;
  const model = hasAnthropic
    ? getModelDynamic("anthropic", "claude-opus-4-5")
    : getModelDynamic("openai", "gpt-5.1-codex");
  const resourceLoader = makeHeadlessLoader(
    cwd,
    "You are Houston. Answer in one short sentence.",
  );
  await resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    model,
    modelRuntime,
    sessionManager: SessionManager.inMemory(cwd),
    resourceLoader,
    tools: ["read", "ls", "bash"],
  });
  let text = "";
  const unsub = session.subscribe((e: AgentSessionEvent) => {
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
