import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FauxResponseStep, fauxProvider } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { WireEvent } from "@houston/runtime-client";
import { HoustonAuthStore } from "../auth/credential-store";
import { PiSession } from "../backends/pi/session";
import { hedgedModelRuntime } from "./hedged-runtime";

/**
 * A REAL pi AgentSession, built the way the pi backend builds one
 * (backends/pi/backend.ts wraps its model runtime the same way), over the
 * scripted faux provider, with a hedge deadline of `deadlineMs`.
 */
export const DEADLINE_MS = 60;

/** A request that never opens its response, until it is cancelled. */
export const neverAnswers: FauxResponseStep = (_context, options) =>
  new Promise((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () =>
      reject(new Error("aborted")),
    );
  });

export async function hedgedSession(
  responses: FauxResponseStep[],
  deadlineMs = DEADLINE_MS,
  settings: Parameters<typeof SettingsManager.inMemory>[0] = {
    retry: { baseDelayMs: 0 },
  },
) {
  const cwd = mkdtempSync(join(tmpdir(), "houston-hedge-"));
  const faux = fauxProvider({
    provider: "faux",
    api: "faux",
    models: [{ id: "faux-1", contextWindow: 200000, maxTokens: 8192 }],
  });
  faux.setResponses(responses);
  const authStorage = new HoustonAuthStore(join(cwd, "auth.json"));
  authStorage.set("faux", { type: "api_key", key: "faux-key" });
  const runtime = await ModelRuntime.create({
    credentials: authStorage,
    modelsPath: join(cwd, "models.json"),
  });
  runtime.registerNativeProvider(faux.provider);
  const answered: number[] = [];
  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    modelRuntime: hedgedModelRuntime(
      runtime,
      { answered: (afterMs) => answered.push(afterMs) },
      () => deadlineMs,
    ),
    model: faux.getModel() as never,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory(settings),
    tools: [],
    customTools: [],
  });
  const wrapped = new PiSession(session);
  const events: WireEvent[] = [];
  wrapped.subscribe((e) => events.push(e));
  return { faux, session: wrapped, events, answered };
}
