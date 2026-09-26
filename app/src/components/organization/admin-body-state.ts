export type AdminBodyState = "pending" | "unavailable" | "ready";

/** A disabled org query is pending without reporting `isLoading`. */
export function adminBodyState(input: {
  gatesReady: boolean;
  showOrganization: boolean;
  orgStatus: "pending" | "error" | "success";
  hasOrg: boolean;
}): AdminBodyState {
  if (input.hasOrg) return "ready";
  if (input.gatesReady && input.showOrganization && input.orgStatus === "error")
    return "unavailable";
  return "pending";
}
