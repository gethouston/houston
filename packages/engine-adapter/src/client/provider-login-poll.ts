import type { ProviderId } from "@houston/runtime-client";
import {
  PROVIDER_CONNECT_TIMEOUT_ERROR,
  PROVIDER_LOGIN_TIMEOUT_ERROR,
} from "@houston-ai/core";
import { emitEvent } from "../bus";
import {
  agentPath,
  runtimeClientFor,
  setupRuntimeClientFor,
} from "../control-plane";
import type { AdapterContext } from "./context";
import { retryCredentialCapture } from "./provider-capture-retry";
import { viaSdk } from "./sdk-error";

const SETUP_LOGIN_KEY = "__setup__";

export function loginKey(agentId: string | null, pid: string): string {
  return `${agentId ?? SETUP_LOGIN_KEY}:${pid}`;
}

export function pinnedLoginAgentId(
  ctx: AdapterContext,
  pid: ProviderId,
): string | null | undefined {
  const suffix = `:${pid}`;
  let pinned: string | null | undefined;
  for (const key of ctx.activeLogins) {
    if (!key.endsWith(suffix)) continue;
    const agent = key.slice(0, -suffix.length);
    pinned = agent === SETUP_LOGIN_KEY ? null : agent;
  }
  return pinned;
}

export function isProviderLoginComplete(pr: {
  configured: boolean;
  login: { status: string } | null;
}): boolean {
  if (!pr.configured) return false;
  return pr.login === null || pr.login.status === "complete";
}

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
      } catch {}
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

export async function pollProviderConnect(
  ctx: AdapterContext,
  agentId: string | null,
  pid: ProviderId,
  oldProvider: string,
): Promise<void> {
  const cp = ctx.cp;
  if (!cp) return;
  const key = loginKey(agentId, pid);
  ctx.activeLogins.add(key);
  const engine = agentId
    ? runtimeClientFor(cp, agentId)
    : setupRuntimeClientFor(cp);
  const deadline = Date.now() + 5 * 60 * 1000;
  try {
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      if (!ctx.activeLogins.has(key)) return;
      let completed = false;
      try {
        const s = await engine.authStatus();
        const pr = s.providers.find((p) => p.provider === pid);
        if (pr?.login?.status === "error") {
          emitEvent("ProviderLoginComplete", {
            provider: oldProvider,
            success: false,
            error: pr.login.error ?? "Login failed",
          });
          return;
        }
        completed = pr ? isProviderLoginComplete(pr) : false;
      } catch {}
      if (completed) {
        if (agentId) {
          try {
            await engine.claimActiveProvider(pid);
          } catch {}
        }
        const credentials = ctx.sdk.providers.credentials;
        try {
          if (agentId) {
            await retryCredentialCapture(() =>
              viaSdk(`${agentPath(agentId)}/credential/capture`, () =>
                credentials.captureCredential(agentId, pid),
              ),
            );
          } else {
            await viaSdk("/setup-runtime/credential/capture", () =>
              credentials.captureSetupCredential(pid),
            );
          }
        } catch (e) {
          if (!agentId) {
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
          emitEvent("ProviderLoginComplete", {
            provider: oldProvider,
            success: false,
            error:
              e instanceof Error ? e.message : "Saving the connected AI failed",
          });
          return;
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
