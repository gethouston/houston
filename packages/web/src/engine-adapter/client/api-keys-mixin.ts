import type * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * Personal API keys (C9) — hosted gateway only. Off-cloud (`this.ctx.cp === null`)
 * there is no public API, so every call throws; the frontend gates the whole
 * surface on `capabilities.apiKeys`, so these are never reached there.
 *
 * Nothing degrades: every gateway failure reaches the caller with the host's
 * reason, so the `key_limit` 400 keeps its inline treatment and a revoke that
 * did not happen is never reported as one.
 */
export function ApiKeysMixin<TBase extends BaseCtor>(Base: TBase) {
  class ApiKeys extends Base {
    async listApiKeys(): Promise<controlPlane.ApiKey[]> {
      if (!this.ctx.cp) throw new Error("API keys require the hosted gateway.");
      return viaSdk("/v1/keys", () => this.ctx.sdk.account.listApiKeys());
    }
    async createApiKey(name: string): Promise<controlPlane.ApiKeyCreated> {
      if (!this.ctx.cp) throw new Error("API keys require the hosted gateway.");
      return viaSdk("/v1/keys", () => this.ctx.sdk.account.createApiKey(name));
    }
    async revokeApiKey(id: string): Promise<void> {
      if (!this.ctx.cp) throw new Error("API keys require the hosted gateway.");
      return viaSdk(`/v1/keys/${encodeURIComponent(id)}`, () =>
        this.ctx.sdk.account.revokeApiKey(id),
      );
    }
  }
  return ApiKeys;
}
