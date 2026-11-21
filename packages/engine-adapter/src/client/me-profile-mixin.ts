import type * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function MeProfileMixin<TBase extends BaseCtor>(Base: TBase) {
  class MeProfile extends Base {
    async getMyProfile(): Promise<controlPlane.EditableProfile | null> {
      if (!this.ctx.cp) return null;
      try {
        return await viaSdk("/v1/me/profile", () =>
          this.ctx.sdk.account.getMyProfile(),
        );
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404)
          return null;
        throw err;
      }
    }
    async setMyProfile(
      update: controlPlane.EditableProfileUpdate,
    ): Promise<controlPlane.EditableProfile> {
      if (!this.ctx.cp)
        throw new Error("Editing your profile needs the hosted gateway.");
      return viaSdk("/v1/me/profile", () =>
        this.ctx.sdk.account.setMyProfile(update),
      );
    }
  }
  return MeProfile;
}
