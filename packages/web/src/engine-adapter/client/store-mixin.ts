import type {
  AvatarUploadResult,
  CreatorAnalytics,
  CreatorProfile,
  CreatorProfilePatch,
  HandleAvailability,
  MyAgent,
  StorePublicationStatus,
  StorePublishRequest,
  StorePublishResponse,
  StoreUnpublishResponse,
  StoreUpdateResponse,
} from "../../../../../ui/engine-client/src/types";
import * as portableProfile from "../portable-profile";
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

    // ---- Owner management (the "my agents" panel) ----
    // Act on a listing by its gateway id, read live off `GET /me/agents`. Same
    // connected-host guard as the publish flow above.
    async listMyStoreAgents(): Promise<MyAgent[]> {
      if (!this.ctx.cp)
        throw new Error("Managing your agents needs a connected host.");
      return portableStore.listMyStoreAgents(this.ctx.cp);
    }
    async requestStorePublic(storeAgentId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("Managing your agents needs a connected host.");
      return portableStore.requestStorePublic(this.ctx.cp, storeAgentId);
    }
    async setStoreVisibilityUnlisted(storeAgentId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("Managing your agents needs a connected host.");
      return portableStore.setStoreVisibilityUnlisted(
        this.ctx.cp,
        storeAgentId,
      );
    }
    async unpublishStoreAgentById(storeAgentId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("Managing your agents needs a connected host.");
      return portableStore.unpublishStoreAgentById(this.ctx.cp, storeAgentId);
    }
    async deleteStoreAgentById(storeAgentId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("Managing your agents needs a connected host.");
      return portableStore.deleteStoreAgentById(this.ctx.cp, storeAgentId);
    }

    // ---- Creator profile (the "publish as @handle" identity) ----
    // The caller's own profile, its handle + avatar, and per-day install
    // analytics against the `/agentstore/me/*` gateway routes with the user's
    // own bearer. Same connected-host guard as the flows above.
    async getMyStoreProfile(): Promise<CreatorProfile | null> {
      if (!this.ctx.cp)
        throw new Error("Your creator profile needs a connected host.");
      return portableProfile.getMyStoreProfile(this.ctx.cp);
    }
    async updateMyStoreProfile(
      patch: CreatorProfilePatch,
    ): Promise<CreatorProfile> {
      if (!this.ctx.cp)
        throw new Error("Your creator profile needs a connected host.");
      return portableProfile.updateMyStoreProfile(this.ctx.cp, patch);
    }
    async checkStoreHandle(handle: string): Promise<HandleAvailability> {
      if (!this.ctx.cp)
        throw new Error("Your creator profile needs a connected host.");
      return portableProfile.checkStoreHandle(this.ctx.cp, handle);
    }
    async uploadStoreAvatar(blob: Blob): Promise<AvatarUploadResult> {
      if (!this.ctx.cp)
        throw new Error("Your creator profile needs a connected host.");
      return portableProfile.uploadStoreAvatar(this.ctx.cp, blob);
    }
    async deleteStoreAvatar(): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("Your creator profile needs a connected host.");
      return portableProfile.deleteStoreAvatar(this.ctx.cp);
    }
    async getMyStoreAnalytics(days?: number): Promise<CreatorAnalytics> {
      if (!this.ctx.cp)
        throw new Error("Your creator profile needs a connected host.");
      return portableProfile.getMyStoreAnalytics(this.ctx.cp, days);
    }
  }
  return Store;
}
