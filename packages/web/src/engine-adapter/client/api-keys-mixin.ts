import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

/**
 * Personal API keys (C9) — hosted gateway only. Off-cloud (`this.cp === null`)
 * there is no public API, so every call throws; the frontend gates the whole
 * surface on `capabilities.apiKeys`, so these are never reached there.
 */
export function ApiKeysMixin<TBase extends BaseCtor>(Base: TBase) {
  class ApiKeys extends Base {
    async listApiKeys(): Promise<controlPlane.ApiKey[]> {
      if (!this.ctx.cp) throw new Error("API keys require the hosted gateway.");
      return controlPlane.listApiKeys(this.ctx.cp);
    }
    async createApiKey(name: string): Promise<controlPlane.ApiKeyCreated> {
      if (!this.ctx.cp) throw new Error("API keys require the hosted gateway.");
      return controlPlane.createApiKey(this.ctx.cp, name);
    }
    async revokeApiKey(id: string): Promise<void> {
      if (!this.ctx.cp) throw new Error("API keys require the hosted gateway.");
      return controlPlane.revokeApiKey(this.ctx.cp, id);
    }
  }
  return ApiKeys;
}
