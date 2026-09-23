import type * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * Org administration: who is in the active space, what role they hold, and the
 * account-level activity/usage reads the admin screens render. Every method
 * here delegates to `sdk.org` — the gateway's `/v1/org*` family — which is why
 * the audit/usage trio lives beside the roster rather than with the per-agent
 * settings in {@link TeamsMixin}.
 *
 * The SDK throws on every non-2xx, so the two degradations this family has
 * (an empty roster, empty profiles) are applied HERE, on the status: the SDK
 * is deployment-agnostic and its contract tests pin the un-softened status, so
 * turning one into an empty answer is web policy and belongs to the adapter.
 */
export function OrgsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Orgs extends Base {
    // ---- org / roles (multiplayer) — hosted gateway only ----
    async getOrg(): Promise<controlPlane.OrgInfo> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk("/v1/org", () => this.ctx.sdk.org.getOrg());
    }
    // Teammate display profiles (name + photo) for a set of member ids. Off-cloud
    // (`this.cp === null`) there is no roster to resolve, so this degrades to an
    // empty map (faces fall back to initials) rather than throwing — a cosmetic
    // read, unlike the org mutators above. Mirrors `getBilling`/`listOrgs`.
    // A gateway that predates the route (404) is the same nothing-to-resolve
    // answer; every other failure throws.
    async getOrgProfiles(
      ids: string[],
    ): Promise<controlPlane.UserProfilesResult> {
      if (!this.ctx.cp) return { profiles: {} };
      try {
        return await viaSdk("/v1/org/profiles", () =>
          this.ctx.sdk.org.getOrgProfiles(ids),
        );
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404) {
          return { profiles: {} };
        }
        throw err;
      }
    }
    // The active space's co-member directory, backing the composer's @mention
    // autocomplete (HOU-944). Off-cloud (`this.cp === null`) there is nobody to
    // mention, so this degrades to an empty list — `@` types plainly and no
    // popover ever opens — rather than throwing, exactly like `getOrgProfiles`,
    // and a gateway that predates the route (404) reads the same way.
    async getOrgPeople(): Promise<controlPlane.OrgPerson[]> {
      if (!this.ctx.cp) return [];
      try {
        return await viaSdk("/v1/org/people", () =>
          this.ctx.sdk.org.getOrgPeople(),
        );
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404) return [];
        throw err;
      }
    }
    async addOrgMember(
      email: string,
      role: controlPlane.OrgRole,
    ): Promise<controlPlane.AddOrgMemberResult> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk("/v1/org/members", () =>
        this.ctx.sdk.org.addOrgMember(email, role),
      );
    }
    async deleteOrgInvite(inviteId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk(`/v1/org/invites/${encodeURIComponent(inviteId)}`, () =>
        this.ctx.sdk.org.deleteOrgInvite(inviteId),
      );
    }
    async removeOrgMember(userId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk(`/v1/org/members/${encodeURIComponent(userId)}`, () =>
        this.ctx.sdk.org.removeOrgMember(userId),
      );
    }
    async setOrgMemberRole(
      userId: string,
      role: controlPlane.OrgRole,
    ): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk(`/v1/org/members/${encodeURIComponent(userId)}`, () =>
        this.ctx.sdk.org.setOrgMemberRole(userId, role),
      );
    }

    // ---- account activity + usage — hosted gateway only ----
    async orgAudit(
      opts: { before?: number; limit?: number } = {},
    ): Promise<controlPlane.AuditEntry[]> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk("/v1/org/audit", () =>
        this.ctx.sdk.org.orgAudit(opts.before, opts.limit),
      );
    }
    async orgUsage(days: number): Promise<controlPlane.UsageRow[]> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk("/v1/org/usage", () => this.ctx.sdk.org.orgUsage(days));
    }
    // Tripwire only: the UI gates the compute section (and its query) on
    // `capabilities.computeUsage`, which no gateway-less deployment advertises.
    async computeUsage(days: number): Promise<controlPlane.ComputeUsage> {
      if (!this.ctx.cp)
        throw new Error("compute usage requires the hosted gateway");
      return viaSdk("/v1/org/compute-usage", () =>
        this.ctx.sdk.org.computeUsage(days),
      );
    }
  }
  return Orgs;
}
