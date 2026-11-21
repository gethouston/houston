export type AuthFailureCause =
  | "no_credentials"
  | "token_expired"
  | "token_revoked"
  | "invalid_api_key"
  | "org_policy_blocked"
  | "billing_locked"
  | "unknown";

export type ModelUnavailableReason =
  | "preview_gated"
  | "deprecated"
  | "region_restricted"
  | "not_deployed"
  | "unknown";

export type QuotaScope = "free_tier" | "paid_plan" | "organization" | "unknown";

export interface ProviderErrorCredential {
  scope: "personal" | "team";
}
