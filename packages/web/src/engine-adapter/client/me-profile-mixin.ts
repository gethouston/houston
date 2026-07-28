import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

export function MeProfileMixin<TBase extends BaseCtor>(Base: TBase) {
  class MeProfile extends Base {
    // ---- the caller's own display profile (name + photo) — hosted gateway only ----
    // Off-cloud (`this.cp === null`) there is no account to edit, so the read
    // degrades to null and the Settings profile section stays hidden — a
    // cosmetic read, exactly like `getOrgProfiles`. The write throws instead:
    // pretending a save succeeded with nowhere to save it is a silent failure.
    async getMyProfile(): Promise<controlPlane.EditableProfile | null> {
      if (!this.ctx.cp) return null;
      return controlPlane.getMyProfile(this.ctx.cp);
    }
    async setMyProfile(
      update: controlPlane.EditableProfileUpdate,
    ): Promise<controlPlane.EditableProfile> {
      if (!this.ctx.cp)
        throw new Error("Editing your profile needs the hosted gateway.");
      return controlPlane.setMyProfile(this.ctx.cp, update);
    }
  }
  return MeProfile;
}
