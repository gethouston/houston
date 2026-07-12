import type {
  StorePublicationStatus,
  StorePublishRequest,
  StorePublishResponse,
  StoreUnpublishResponse,
  StoreUpdateResponse,
} from "../../../../../ui/engine-client/src/types";
import * as portableStore from "../portable-store";
import type { BaseCtor } from "./mixin";

export function StoreMixin<TBase extends BaseCtor>(Base: TBase) {
  class Store extends Base {
    // ---- Agent Store publication (account-based; host gathers, app publishes) ----
    // The host is credential-free: it gathers the IR and keeps a token-free
    // pointer; the APP creates/patches the listing on the gateway `/v1/agentstore`
    // API with the user's OWN bearer (see ../portable-store.ts). All five methods
    // need the control-plane config — the host that serves the portable routes —
    // exactly like the portable cluster.
    async publishAgentToStore(
      agentPath: string,
      req: StorePublishRequest,
    ): Promise<StorePublishResponse> {
      if (!this.ctx.cp)
        throw new Error("Publishing an agent needs a connected host.");
      return portableStore.publishToStore(this.ctx.cp, agentPath, req);
    }
    async updateStorePublication(
      agentPath: string,
      req: StorePublishRequest,
    ): Promise<StoreUpdateResponse> {
      if (!this.ctx.cp)
        throw new Error("Publishing an agent needs a connected host.");
      return portableStore.updatePublication(this.ctx.cp, agentPath, req);
    }
    async unpublishFromStore(
      agentPath: string,
    ): Promise<StoreUnpublishResponse> {
      if (!this.ctx.cp)
        throw new Error("Publishing an agent needs a connected host.");
      return portableStore.unpublishFromStore(this.ctx.cp, agentPath);
    }
    async getStorePublication(
      agentPath: string,
    ): Promise<StorePublicationStatus> {
      if (!this.ctx.cp)
        throw new Error("Publishing an agent needs a connected host.");
      return portableStore.getPublication(this.ctx.cp, agentPath);
    }
  }
  return Store;
}
