export const LEADERSHIP_ROLE_IDS = [
  "founder",
  "co_founder",
  "owner",
  "ceo",
  "president",
  "managing_director",
  "general_manager",
  "coo",
  "cfo",
  "cto",
  "cmo",
  "cro",
  "vp",
  "director",
  "head_of_department",
  "partner",
  "team_lead",
  "manager",
] as const;

export type LeadershipRoleId = (typeof LEADERSHIP_ROLE_IDS)[number];

export function isLeadershipRoleId(value: unknown): value is LeadershipRoleId {
  return (
    typeof value === "string" &&
    (LEADERSHIP_ROLE_IDS as readonly string[]).includes(value)
  );
}
