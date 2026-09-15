import type * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function MeProfileMixin<TBase extends BaseCtor>(Base: TBase) {
  class MeProfile extends Base {
    // ---- the caller's own display profile (name + photo) — hosted gateway only ----
    // Off-cloud (`this.ctx.cp === null`) there is no account to edit, so the read
    // degrades to null and the Settings profile section stays hidden — a
    // cosmetic read, exactly like `getOrgProfiles`. A gateway that predates
    // `/v1/me/profile` reads the same way: the SDK throws every non-2xx (it
    // stays honest for iOS), and the 404 is swallowed HERE so a pre-feature
    // host renders byte-identically. Every other error still surfaces.
    // The write throws instead: pretending a save succeeded with nowhere to
    // save it is a silent failure.
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
