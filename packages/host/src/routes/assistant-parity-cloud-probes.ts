import {
  type CloudOnlyProbe,
  cloudOnly,
  PROBE_AGENT,
} from "./assistant-parity-probes";

/**
 * Operations the local host legitimately does not serve, each with the reason.
 *
 * They are asserted to MISS the route table entirely: a cloud-only path that
 * starts resolving locally means the two surfaces drifted and this list is
 * stale. The reason is the point of the entry — "the local host 404s" is a
 * fact, "and here is why that is correct" is the contract.
 */
const AGENT = { agentSlugOrId: PROBE_AGENT };
const NO_TEAM = { teamId: "no-such-team" };
const NO_USER = { userId: "no-such-user" };
const NO_INVITE = { inviteId: "no-such-invite" };

const SPACES = "spaces and their membership exist only on the hosted gateway";
const TEAMS =
  "teams group agents for teammates, which a single-user host has none of";
const PER_AGENT_POLICY = "manager-set per-agent policy is a Teams surface";

export const CLOUD_ONLY_PROBES: readonly CloudOnlyProbe[] = [
  // The space itself, and who is in it.
  cloudOnly("getOrg", SPACES),
  cloudOnly("listOrgs", "a local host has no account with more than one space"),
  cloudOnly("createOrg", SPACES, { name: "Parity Probe Space" }),
  cloudOnly("getOrgPeople", SPACES),
  cloudOnly("addOrgMember", SPACES, {
    email: "probe@example.com",
    role: "user",
  }),
  cloudOnly("setOrgMemberRole", SPACES, { ...NO_USER, role: "user" }),
  cloudOnly("removeOrgMember", SPACES, NO_USER),
  cloudOnly("deleteOrgInvite", SPACES, NO_INVITE),
  cloudOnly("acceptOrgInvite", SPACES, NO_INVITE),
  cloudOnly("declineOrgInvite", SPACES, NO_INVITE),
  cloudOnly("moveAgent", SPACES, { ...AGENT, toSlug: "no-such-space" }),
  cloudOnly("getMoveStatus", SPACES, { ...AGENT, moveId: "no-such-move" }),

  // Money, which only a hosted subscription has.
  cloudOnly("getBilling", "billing is a hosted-subscription concern"),
  cloudOnly("createCheckout", "billing is a hosted-subscription concern", {
    interval: "monthly",
  }),
  cloudOnly("createPortal", "billing is a hosted-subscription concern"),
  cloudOnly("orgUsage", "usage is metered by the gateway that bills for it", {
    days: 1,
  }),
  cloudOnly(
    "computeUsage",
    "usage is metered by the gateway that bills for it",
    { days: 1 },
  ),

  // Teams, and the per-agent ceilings a manager sets through them.
  cloudOnly("listAgentTeams", TEAMS),
  cloudOnly("createAgentTeam", TEAMS, { input: { name: "Probe" } }),
  cloudOnly("updateAgentTeam", TEAMS, { ...NO_TEAM, patch: {} }),
  cloudOnly("deleteAgentTeam", TEAMS, NO_TEAM),
  cloudOnly("joinAgentTeam", TEAMS, NO_TEAM),
  cloudOnly("listAgentTeamMembers", TEAMS, NO_TEAM),
  cloudOnly("removeAgentTeamMember", TEAMS, { ...NO_TEAM, ...NO_USER }),
  cloudOnly("setAgentTeamMemberOwner", TEAMS, {
    ...NO_TEAM,
    ...NO_USER,
    owner: false,
  }),
  cloudOnly("setAgentTeam", TEAMS, { ...AGENT, teamId: "no-such-team" }),
  cloudOnly("getAgentSettings", PER_AGENT_POLICY, AGENT),
  cloudOnly("setAgentSettings", PER_AGENT_POLICY, { ...AGENT, settings: {} }),
  cloudOnly("getAgentModelChoice", PER_AGENT_POLICY, AGENT),
  cloudOnly("setAgentModelChoice", PER_AGENT_POLICY, { ...AGENT, choice: {} }),
  cloudOnly(
    "agentTriggerStatus",
    "the gateway owns trigger subscriptions",
    AGENT,
  ),

  // The person behind the account, as the identity provider knows them.
  cloudOnly(
    "getMyProfile",
    "the display profile comes from the hosted identity provider",
  ),
  cloudOnly(
    "setMyProfile",
    "the display profile comes from the hosted identity provider",
    { update: {} },
  ),
  cloudOnly(
    "listApiKeys",
    "personal API keys authenticate against the hosted public API",
  ),
];
