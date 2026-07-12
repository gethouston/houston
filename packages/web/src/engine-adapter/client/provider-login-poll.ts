import { EngineError, type ProviderId } from "@houston/runtime-client";
import { emitEvent } from "../bus";
import {
  captureCredential,
  captureSetupCredential,
  runtimeClientFor,
  setupRuntimeClientFor,
} from "../control-plane";
import type { AdapterContext } from "./context";

/**
 * `activeLogins` key segment for a login started before any agent existed
 * (first-run: it runs in the host's hidden setup runtime, not an agent's).
 */
export const SETUP_LOGIN_KEY = "__setup__";

/**
 * Treat a 404 on login/cancel as benign: it means no login was pending (or an
 * older host lacks the cancel route), so cancel's postcondition — the login
 * slot is free — already holds. The reconnect card's every press goes
 * cancel → launch, so propagating this 404 aborted the chain and the login
 * never launched (HOU-676). Every other failure still propagates.
 */
export function benignCancelMiss(e: unknown): void {
  if (e instanceof EngineError && e.status === 404) return;
  throw e;
}

/**
 * Poll auth status until the in-flight login for `pid` resolves, then emit
 * `ProviderLoginComplete` so the legacy dialog closes and the card flips.
 * Covers all three flows: loopback auto-catch, pasted headless code, and
 * device-code polling. Local mode only (cloud uses pollProviderConnect).
 */
export function watchLoginCompletion(
  ctx: AdapterContext,
  pid: ProviderId,
  name: string,
): void {
  stopLoginWatch(ctx, name);
  const startedAt = Date.now();
  const finish = (success: boolean, error: string | null) => {
    stopLoginWatch(ctx, name);
    emitEvent("ProviderLoginComplete", { provider: name, success, error });
  };
  const timer = setInterval(() => {
    void (async () => {
      try {
        const status = await ctx.engine.authStatus();
        const pr = status.providers.find((p) => p.provider === pid);
        if (pr?.configured) finish(true, null);
        else if (pr?.login?.status === "error")
          finish(false, pr?.login?.error ?? "Login failed");
        else if (Date.now() - startedAt > 10 * 60 * 1000)
          finish(false, "Login timed out");
      } catch {
        /* engine briefly unreachable; keep polling */
      }
    })();
  }, 1500);
  ctx.loginWatchers.set(name, timer);
}

export function stopLoginWatch(ctx: AdapterContext, name: string): void {
  const timer = ctx.loginWatchers.get(name);
  if (timer !== undefined) {
    clearInterval(timer);
    ctx.loginWatchers.delete(name);
  }
}

/**
 * Poll the agent's sandbox until the device-code login lands (the runtime
 * polls OpenAI in-process and writes auth.json to the PVC), then CLAIM the
 * new provider as this agent's active one (first connect only — never moves
 * an agent that already has a provider, HOU-695) and signal completion —
 * which closes the dialog and refreshes provider status. Emits a failure on
 * timeout (no silent stall). Cancellable via `cancelProviderLogin`. A null
 * `agentId` is the first-run pre-agent flow: the login ran in the host's hidden
 * SETUP runtime, so poll + capture there (no per-agent settings to flip yet —
 * the agent created next carries its provider from creation).
 */
export async function pollProviderConnect(
  ctx: AdapterContext,
  agentId: string | null,
  pid: ProviderId,
  oldProvider: string,
): Promise<void> {
  const cp = ctx.cp;
  if (!cp) return;
  const key = `${agentId ?? SETUP_LOGIN_KEY}:${pid}`;
  ctx.activeLogins.add(key);
  const engine = agentId
    ? runtimeClientFor(cp, agentId)
    : setupRuntimeClientFor(cp);
  const deadline = Date.now() + 5 * 60 * 1000;
  try {
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      if (!ctx.activeLogins.has(key)) return; // cancelled
      let configured = false;
      try {
        const s = await engine.authStatus();
        configured =
          s.providers.find((p) => p.provider === pid)?.configured ?? false;
      } catch {
        /* transient — keep polling */
      }
      if (configured) {
        // CLAIM (don't set) the active provider: it becomes active only for
        // a first connect on a fresh agent — a connect never moves an agent
        // that already has a provider, so no open chat switches (HOU-695).
        // Skipped pre-agent: the setup runtime has no agent settings.
        if (agentId) {
          try {
            await engine.claimActiveProvider(pid);
          } catch {
            /* non-fatal: the user can pick the model in the chat header */
          }
        }
        // Connect-once: store this credential for the WHOLE workspace, so every
        // agent (existing + new + the one onboarding creates next) shares it.
        try {
          if (agentId) {
            await captureCredential(cp, agentId, pid);
          } else {
            await captureSetupCredential(cp, pid);
          }
        } catch (e) {
          console.error("[connect] workspace credential capture failed", e);
        }
        emitEvent("ProviderLoginComplete", {
          provider: oldProvider,
          success: true,
          error: null,
        });
        return;
      }
    }
    emitEvent("ProviderLoginComplete", {
      provider: oldProvider,
      success: false,
      error: "Connection timed out. Please try connecting again.",
    });
  } finally {
    ctx.activeLogins.delete(key);
  }
}
