import { EngineError, type ProviderId } from "@houston/runtime-client";
import {
  PROVIDER_CONNECT_TIMEOUT_ERROR,
  PROVIDER_LOGIN_TIMEOUT_ERROR,
} from "@houston-ai/core";
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
 * True iff this provider's login is genuinely DONE — not merely `configured`.
 * A stale stored credential leaves `configured: true` while the just-launched
 * OAuth is still `awaiting_user`, and treating that as success completed the
 * login dialog (and onboarding's "your AI is connected" beat) the instant the
 * poll first ticked, without the user ever finishing in the browser. A login
 * counts as complete only when the runtime reports no in-flight login (null)
 * or its login reached `complete`.
 */
export function isProviderLoginComplete(pr: {
  configured: boolean;
  login: { status: string } | null;
}): boolean {
  if (!pr.configured) return false;
  return pr.login === null || pr.login.status === "complete";
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
        if (pr && isProviderLoginComplete(pr)) finish(true, null);
        else if (pr?.login?.status === "error")
          finish(false, pr?.login?.error ?? "Login failed");
        else if (Date.now() - startedAt > 10 * 60 * 1000)
          finish(false, PROVIDER_LOGIN_TIMEOUT_ERROR);
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
      let completed = false;
      try {
        const s = await engine.authStatus();
        const pr = s.providers.find((p) => p.provider === pid);
        if (pr?.login?.status === "error") {
          // The runtime's login flow died (denied consent, provider outage).
          // Surface it now — waiting out the 5-minute timeout hid the reason.
          emitEvent("ProviderLoginComplete", {
            provider: oldProvider,
            success: false,
            error: pr.login.error ?? "Login failed",
          });
          return;
        }
        // NOT bare `configured`: a stale stored credential reports configured
        // while the just-launched OAuth is still awaiting the user, and that
        // false success completed onboarding with an AI that never connected.
        completed = pr ? isProviderLoginComplete(pr) : false;
      } catch {
        /* transient — keep polling */
      }
      if (completed) {
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
          if (!agentId) {
            // Pre-agent (first-run) the captured credential is the ONLY thing
            // the agent created next inherits — reporting success here let
            // onboarding celebrate "your AI is connected" and then fail the
            // send-email step with "no AI provider". Surface the failure.
            emitEvent("ProviderLoginComplete", {
              provider: oldProvider,
              success: false,
              error:
                e instanceof Error
                  ? e.message
                  : "Saving the connected AI failed",
            });
            return;
          }
          // With an agent, the credential already lives in ITS runtime — the
          // connect works for this agent; only workspace-wide sharing failed.
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
      error: PROVIDER_CONNECT_TIMEOUT_ERROR,
    });
  } finally {
    ctx.activeLogins.delete(key);
  }
}
