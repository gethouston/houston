import type * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

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
