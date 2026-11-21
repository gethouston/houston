export const orgQueryKeys = {
  org: () => ["org"] as const,
  seatQuote: () => ["org", "seat-quote"] as const,
  memberRoutines: (userId?: string) =>
    userId === undefined
      ? (["member-routines"] as const)
      : (["member-routines", userId] as const),
  orgs: () => ["orgs"] as const,
  billing: (orgSlug: string) => ["billing", orgSlug] as const,
  billingAll: () => ["billing"] as const,
  planRoutines: (orgSlug: string) => ["plan-routines", orgSlug] as const,
  billingChoice: () => ["billing-choice"] as const,
  agentMove: (agentId: string, moveId: string) =>
    ["agent-move", agentId, moveId] as const,
  orgAudit: () => ["org-audit"] as const,
  orgUsage: (days: number) => ["org-usage", days] as const,
  computeUsage: (days: number) => ["compute-usage", days] as const,
  agentSettings: (agentId: string) => ["agent-settings", agentId] as const,
  agentDelegation: (agentId: string) => ["agent-delegation", agentId] as const,
  agentModelChoice: (agentId: string) =>
    ["agent-model-choice", agentId] as const,
};
