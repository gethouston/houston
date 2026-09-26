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
const NO_USER = { userId: "no-such-user" };
const NO_INVITE = { inviteId: "no-such-invite" };

const SPACES = "spaces and their membership exist only on the hosted gateway";
const PER_AGENT_POLICY = "manager-set per-agent policy is a Teams surface";
const API_KEYS = "personal API keys authenticate against the hosted public API";
const CHANNELS =
  "the gateway holds the Slack app's credentials and receives its events, so a messaging connection exists only there";

const PERSONAL_PLAN =
  "the personal plan (usage limit, Plus) is metered and billed by the hosted gateway";
const PLAN_ROUTINES =
  "the plan's routine limits are enforced by the hosted control plane's scheduler";

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
  cloudOnly("deleteOrg", SPACES, { slug: "no-such-space" }),
  cloudOnly("moveAgent", SPACES, { ...AGENT, toSlug: "no-such-space" }),
  cloudOnly("getMoveStatus", SPACES, { ...AGENT, moveId: "no-such-move" }),

  // Workspace and user context: the gateway terminates these itself and keeps
  // them in its own store, so a local host never sees the route.
  cloudOnly("getContext", "shared context is stored by the hosted gateway", {
    kind: "workspace",
  }),
  cloudOnly("setContext", "shared context is stored by the hosted gateway", {
    kind: "workspace",
    content: "",
  }),

  // Money, which only a hosted subscription has.
  cloudOnly("getBilling", "billing is a hosted-subscription concern"),
  cloudOnly("createCheckout", "billing is a hosted-subscription concern", {
    interval: "monthly",
  }),
  cloudOnly("createPortal", "billing is a hosted-subscription concern"),

  // The personal plan (C19): limits and Plus are metered and billed by the gateway.
  cloudOnly("getPlan", PERSONAL_PLAN),
  cloudOnly("createPlusCheckout", PERSONAL_PLAN),
  cloudOnly("createPlusPortal", PERSONAL_PLAN),
  cloudOnly("listPlusInvoices", PERSONAL_PLAN),
  cloudOnly("dismissPlanAnnouncement", PERSONAL_PLAN),
  cloudOnly("reportPresence", PERSONAL_PLAN),
  cloudOnly("listPlanRoutines", PLAN_ROUTINES),
  cloudOnly("keepRoutine", PLAN_ROUTINES, {
    orgSlug: "no-such-org",
    agentSlug: "no-such-agent",
    routineId: "no-such-routine",
  }),
  cloudOnly("resumeRoutines", PLAN_ROUTINES),
  cloudOnly("orgUsage", "usage is metered by the gateway that bills for it", {
    days: 1,
  }),
  cloudOnly(
    "computeUsage",
    "usage is metered by the gateway that bills for it",
    { days: 1 },
  ),
  cloudOnly(
    "orgAudit",
    "the record of who did what is written by the gateway that authorizes them",
  ),

  // The per-agent ceilings a manager sets on a shared agent.
  cloudOnly("setAgentAssignments", PER_AGENT_POLICY, {
    ...AGENT,
    assignments: [],
  }),
  cloudOnly("getAgentSettings", PER_AGENT_POLICY, AGENT),
  cloudOnly("setAgentSettings", PER_AGENT_POLICY, { ...AGENT, settings: {} }),
  cloudOnly("getAgentModelChoice", PER_AGENT_POLICY, AGENT),
  cloudOnly("setAgentModelChoice", PER_AGENT_POLICY, { ...AGENT, choice: {} }),
  cloudOnly(
    "agentTriggerStatus",
    "the gateway owns trigger subscriptions",
    AGENT,
  ),

  // Messaging channels: the assistant answering in Slack.
  cloudOnly("getChannels", CHANNELS),
  cloudOnly("connectSlack", CHANNELS),
  cloudOnly("linkSlack", CHANNELS),
  cloudOnly("completeSlack", CHANNELS, { ticket: "no-such-ticket" }),
  cloudOnly("disconnectChannel", CHANNELS, {
    connectionId: "no-such-connection",
  }),

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
  cloudOnly("listApiKeys", API_KEYS),
  cloudOnly("createApiKey", API_KEYS, { name: "parity probe" }),
  cloudOnly("revokeApiKey", API_KEYS, { id: "no-such-key" }),

  // A routine's webhook, which arrives at the gateway that mints the key
  // authenticating it — a local host has no public address to receive one.
  cloudOnly(
    "mintRoutineWebhookKey",
    "a routine webhook arrives at the hosted gateway, which mints the key that authenticates it",
    { agentId: PROBE_AGENT, routineId: "no-such-routine" },
  ),
];
