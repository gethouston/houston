import { emitEvent } from "../bus";
import * as controlPlane from "../control-plane";
import { toNewProvider, toOldProvider } from "../synthetic";
import type { BaseCtor } from "./mixin";
import {
  benignCancelMiss,
  pollProviderConnect,
  SETUP_LOGIN_KEY,
  stopLoginWatch,
  watchLoginCompletion,
} from "./provider-login-poll";

export function ProviderLoginMixin<TBase extends BaseCtor>(Base: TBase) {
  class ProviderLogin extends Base {
    // `deviceAuth` is the client's "I can't catch a loopback callback" flag — the
    // co-located desktop sends false (it CAN), remote webapps send true. It steers
    // Codex's flow (false → browser/loopback, true → device code); Claude keys off
    // the runtime's own headless mode regardless. Default true so a caller that
    // omits it never asks a remote runtime for an unreachable loopback.
    async providerLogin(
      name: string,
      opts?: { deviceAuth?: boolean; enterpriseDomain?: string },
    ): Promise<void> {
      const pid = toNewProvider(name);
      if (!pid) throw new Error(`provider ${name} not supported`);
      const deviceAuth = opts?.deviceAuth ?? true;
      // GitHub Copilot: the company GitHub domain when the user chose the Company
      // plan in the connect dialog. Undefined => Personal/github.com (and every
      // other provider). The runtime runs the device-code flow against that GitHub.
      const enterpriseDomain = opts?.enterpriseDomain;

      if (!this.ctx.cp) {
        // Local single runtime. Drive the legacy login dialog: `device_code`
        // carries the code to display; `url` (loopback) and `auth_code`
        // (headless Claude) leave `user_code` null so the dialog shows a paste
        // field. The runtime emits no completion event, so poll and synthesize.
        const info = await this.ctx.engine.startLogin(
          pid,
          deviceAuth,
          enterpriseDomain,
        );
        const url =
          info.kind === "device_code" ? info.verificationUri : info.url;
        const userCode = info.kind === "device_code" ? info.userCode : null;
        // The bus event is the ONE opening path: an app-side handler (a mounted
        // login surface, else the shell's global fallback) opens the URL via the
        // platform opener. A direct window.open here double-opened next to those
        // handlers — and was a silent no-op inside the desktop's WKWebView.
        emitEvent("ProviderLoginUrl", {
          provider: name,
          url,
          user_code: userCode,
          // `auth_code` (headless Claude setup-token): `url` is only docs, so the
          // handler must show the paste dialog, never auto-open it. `instructions`
          // is the runtime's paste-step copy the dialog renders above the field.
          auth_code: info.kind === "auth_code",
          instructions:
            info.kind === "auth_code" ? info.instructions : undefined,
        });
        watchLoginCompletion(this.ctx, pid, name);
        return;
      }

      // Control-plane path (cloud sandbox OR the desktop host sidecar). Start the
      // login in THIS agent's runtime — or, before any agent exists (first-run
      // onboarding connects the AI ahead of agent creation), in the host's hidden
      // SETUP runtime — and surface it on the bus the picker/settings handler
      // consumes. A remote runtime returns a device_code (we pass its
      // `user_code`, which opens the code panel); a co-located desktop client gets
      // a loopback `url` (user_code null) that the handler opens straight in the
      // browser. `provider` MUST be the old/frontend id (the dialog's contract).
      const agentId = this.ctx.currentAgentId();
      const old = toOldProvider(pid);
      const engine = agentId
        ? controlPlane.runtimeClientFor(this.ctx.cp, agentId)
        : controlPlane.setupRuntimeClientFor(this.ctx.cp);
      const info = await engine.startLogin(pid, deviceAuth, enterpriseDomain);
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
          // Setup-token paste flow (Claude): the url is docs-only, so the handler
          // shows the paste dialog instead of opening it. `instructions` carries
          // the runtime's paste-step copy; absent for the loopback `url` kind.
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
      // Same target the login started in: the agent's runtime, or the setup
      // runtime when first-run connected pre-agent.
      const engine = this.ctx.cp ? this.ctx.providerEngine() : this.ctx.engine;
      await engine.completeLogin(pid, code);
    }
    async cancelProviderLogin(name?: string): Promise<void> {
      const pid = name ? toNewProvider(name) : undefined;
      if (!name || !pid) return;
      if (this.ctx.cp) {
        // Key mirrors pollProviderConnect: the agent's id, or the setup-runtime
        // sentinel when the first-run login started before any agent existed.
        const agentId = this.ctx.currentAgentId();
        this.ctx.activeLogins.delete(`${agentId ?? SETUP_LOGIN_KEY}:${pid}`); // stop the poll
        // Kill the runtime-side login too, in the same runtime the login started
        // in (the agent's sandbox, or the hidden setup runtime pre-agent) —
        // otherwise it keeps polling the provider until timeout and a retry
        // collides with the stale flow ("sign-in already pending", HOU-664 /
        // the HOU-438 failure class).
        await this.ctx
          .providerEngine()
          .cancelLogin(pid)
          .catch(benignCancelMiss);
        return;
      }
      stopLoginWatch(this.ctx, name);
      // Cancel the runtime's in-flight OAuth flow for real (frees the loopback
      // port + login slot), not just the local watcher.
      await this.ctx.engine.cancelLogin(pid).catch(benignCancelMiss);
      // Benign completion: clears the dialog + spinner without an error toast,
      // matching the old engine's cancel semantics.
      emitEvent("ProviderLoginComplete", {
        provider: name,
        success: false,
        error: null,
      });
    }
  }
  return ProviderLogin;
}
