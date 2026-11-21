import { EngineError, type HoustonEngineClient } from "@houston/runtime-client";
import { emitEvent } from "../bus";
import * as controlPlane from "../control-plane";
import { toNewProvider, toOldProvider } from "../synthetic";
import type { BaseCtor } from "./mixin";
import { withProviderAgentRetarget } from "./provider-agent-gone";
import { surfaceTypedLoginFailure } from "./provider-login-failure";
import {
  loginKey,
  pinnedLoginAgentId,
  pollProviderConnect,
  stopLoginWatch,
  watchLoginCompletion,
} from "./provider-login-poll";
import { requireProviderRouting } from "./provider-routing";

function benignCancelMiss(e: unknown): void {
  if (e instanceof EngineError && e.status === 404) return;
  throw e;
}

export function ProviderLoginMixin<TBase extends BaseCtor>(Base: TBase) {
  class ProviderLogin extends Base {
    async providerLogin(
      name: string,
      opts?: { deviceAuth?: boolean; enterpriseDomain?: string },
    ): Promise<void> {
      const pid = toNewProvider(name);
      if (!pid) throw new Error(`provider ${name} not supported`);
      const deviceAuth = opts?.deviceAuth ?? true;
      const enterpriseDomain = opts?.enterpriseDomain;

      if (!this.ctx.cp) {
        let info: Awaited<ReturnType<typeof this.ctx.engine.startLogin>>;
        try {
          info = await this.ctx.engine.startLogin(
            pid,
            deviceAuth,
            enterpriseDomain,
          );
        } catch (err) {
          if (surfaceTypedLoginFailure(name, err)) return;
          throw err;
        }
        const url =
          info.kind === "device_code" ? info.verificationUri : info.url;
        const userCode = info.kind === "device_code" ? info.userCode : null;
        emitEvent("ProviderLoginUrl", {
          provider: name,
          url,
          user_code: userCode,
          auth_code: info.kind === "auth_code",
          instructions:
            info.kind === "auth_code" ? info.instructions : undefined,
        });
        watchLoginCompletion(this.ctx, pid, name);
        return;
      }

      requireProviderRouting(this.ctx);
      const cp = this.ctx.cp;
      const old = toOldProvider(pid);
      let agentId: string | null = null;
      let info: Awaited<ReturnType<HoustonEngineClient["startLogin"]>>;
      try {
        info = await withProviderAgentRetarget(this.ctx, (target) => {
          agentId = target;
          const engine = target
            ? controlPlane.runtimeClientFor(cp, target)
            : controlPlane.setupRuntimeClientFor(cp);
          return engine.startLogin(pid, deviceAuth, enterpriseDomain);
        });
      } catch (err) {
        if (surfaceTypedLoginFailure(old, err)) return;
        throw err;
      }
      if (info.kind === "device_code") {
        emitEvent("ProviderLoginUrl", {
          provider: old,
          url: info.verificationUri,
          user_code: info.userCode,
        });
      } else {
        emitEvent("ProviderLoginUrl", {
          provider: old,
          url: info.url,
          user_code: null,
          auth_code: info.kind === "auth_code",
          instructions:
            info.kind === "auth_code" ? info.instructions : undefined,
        });
      }
      void pollProviderConnect(this.ctx, agentId, pid, old);
    }
    async submitProviderLoginCode(name: string, code: string): Promise<void> {
      const pid = toNewProvider(name);
      if (!pid) return;
      const cp = this.ctx.cp;
      if (!cp) {
        await this.ctx.engine.completeLogin(pid, code);
        return;
      }
      const pinned = pinnedLoginAgentId(this.ctx, pid);
      const engine =
        pinned === undefined
          ? this.ctx.providerEngine()
          : pinned === null
            ? controlPlane.setupRuntimeClientFor(cp)
            : controlPlane.runtimeClientFor(cp, pinned);
      await engine.completeLogin(pid, code);
    }
    async cancelProviderLogin(name?: string): Promise<void> {
      const pid = name ? toNewProvider(name) : undefined;
      if (!name || !pid) return;
      if (this.ctx.cp) {
        const pinned = pinnedLoginAgentId(this.ctx, pid);
        const agentId =
          pinned === undefined ? this.ctx.providerAgentId() : pinned;
        this.ctx.activeLogins.delete(loginKey(agentId, pid));
        const engine = agentId
          ? this.ctx.providerEngineFor(agentId)
          : controlPlane.setupRuntimeClientFor(this.ctx.cp);
        await engine.cancelLogin(pid).catch(benignCancelMiss);
        return;
      }
      stopLoginWatch(this.ctx, name);
      await this.ctx.engine.cancelLogin(pid).catch(benignCancelMiss);
      emitEvent("ProviderLoginComplete", {
        provider: name,
        success: false,
        error: null,
      });
    }
  }
  return ProviderLogin;
}
