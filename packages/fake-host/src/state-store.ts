import type {
  Activity,
  Capabilities,
  Learning,
  SidebarLayout,
} from "@houston/protocol";
import type {
  ChatMessage,
  IntegrationConnection,
  TokenUsage,
} from "@houston/runtime-client";
import type { OrgBilling } from "@houston/wire-types";
import { SEED_AGENT_ID, SEED_AGENT_NAME, SEED_WORKSPACE_ID } from "./config";
import { resetBillingChoice } from "./state-billing-choice";
import { resetPlan } from "./state-plan";
import { resetProviders } from "./state-providers";
import { resetSharedSkills } from "./state-shared-skills";
import { resetSkills } from "./state-skills";
import { resetArming } from "./state-test-arming";

export type IntegrationsMode = "ready" | "unavailable" | "signin" | "absent";

export interface CustomIntegrationSeed {
  slug: string;
  name: string;
  kind: "openapi" | "mcp";
  auth?: "none" | "credential" | "oauth";
  displayUrl?: string;
  iconUrl?: string;
  addedAtMs: number;
  state:
    | { status: "active"; toolCount: number }
    | {
        status: "pending";
        authMethods: {
          template: string;
          label: string;
          fields: { variable: string; label: string }[];
        }[];
      }
    | { status: "error"; message: string };
  authMethods?: {
    template: string;
    label: string;
    fields: { variable: string; label: string }[];
  }[];
  tools?: { name: string; description?: string }[];
}

export type FakeCapabilities = Capabilities & {
  teams?: boolean;
  spaces?: boolean;
  computeUsage?: boolean;
};

export interface ComputeUsageSeedRow {
  agentSlug: string;
  day: string;
  awakeMs: number;
  activeMs: number;
  wakes: number;
  turns: number;
  routineRuns: number;
}

export interface ComputeUsageSeed {
  rows: ComputeUsageSeedRow[];
  awakeNow: string[];
}

export type AgentAccess = "manager" | "user";

export type OrgRole = "owner" | "admin" | "user";

export const SELF_USER_ID = "u-self";

export const FAKE_ORG_NAME = "Acme";

export interface FakeMeProfile {
  displayName?: string;
  photoUrl?: string;
  custom: { displayName: boolean; photoUrl: boolean };
}

export interface FakeAssignment {
  userId: string;
  access: AgentAccess;
}

export interface FakeMember {
  userId: string;
  email?: string;
  role: OrgRole;
  displayName?: string;
  photoUrl?: string;
}

export interface FakeInvite {
  id: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
  createdAt: number;
}

export interface FakeTeamWorkspace {
  id: string;
  name: string;
  role?: OrgRole;
  memberCount?: number;
  billing?: OrgBilling | null;
}

export type SpaceInviteRejection =
  | "needs_upgrade"
  | "already_member"
  | "invite_not_found";

export interface FakeSpaceInvite {
  id: string;
  orgName: string;
  orgSlug: string;
  role: OrgRole;
  invitedBy?: string;
  reject?: SpaceInviteRejection;
}

export interface TeamsSettings {
  allowedToolkits: string[] | null;
  allowedModels: string[] | null;
  access: AgentAccess;
}

export const DEFAULT_CAPABILITIES: FakeCapabilities = {
  officePreview: false,
  profile: "local",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "disabled",
  providers: ["anthropic"],
  openaiCompatible: false,
  integrations: [],
  sharedSkills: true,
  customIntegrationOAuth: true,
};

export const DEFAULT_TEAMS_SETTINGS: TeamsSettings = {
  allowedToolkits: null,
  allowedModels: null,
  access: "manager",
};

export interface CpAgent {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: number;
  role?: string;
  assignedUserIds?: string[];
  access?: AgentAccess;
  assignments?: FakeAssignment[];
  orgSlug?: string;
}

export const ACTIVITY_PATH = ".houston/activity/activity.json";
export const ROUTINES_PATH = ".houston/routines/routines.json";
export const LEARNINGS_PATH = ".houston/learnings/learnings.json";
export const SEED_USAGE: TokenUsage = {
  context_tokens: 1200,
  output_tokens: 80,
  cached_tokens: 0,
};
export const EPOCH = Date.UTC(2024, 0, 1);
export const ISO = new Date(EPOCH).toISOString();

const SEED_TRIP_CONTRIBUTORS = [
  { user_id: SELF_USER_ID, name: "Ada Lovelace" },
  { user_id: "u-bob", name: "Bob Stone" },
];

const SEED_LAUNCH_CONTRIBUTORS = [
  { user_id: SELF_USER_ID, name: "Ada Lovelace" },
  { user_id: "u-bob", name: "Bob Stone" },
  { user_id: "u-cleo", name: "Cleo Nakamura" },
  { user_id: "u-dmitri", name: "Dmitri Volkov" },
  { user_id: "u-elena", name: "Elena Ruiz" },
  { user_id: "u-farid", name: "Farid Haddad" },
  { user_id: "u-gita", name: "Gita Raman" },
];

const SEED_ACTIVITIES: Activity[] = [
  {
    id: "act-1",
    title: "Plan a trip to Tokyo",
    description: "Research flights and hotels for the spring",
    status: "needs_you",
    updated_at: ISO,
    created_by: SELF_USER_ID,
    contributors: SEED_TRIP_CONTRIBUTORS,
  },
  {
    id: "act-2",
    title: "Draft the launch email",
    description: "Write the beta announcement to the waitlist",
    status: "done",
    updated_at: ISO,
    created_by: SELF_USER_ID,
    contributors: SEED_LAUNCH_CONTRIBUTORS,
  },
];

const SEED_LEARNINGS: Learning[] = [
  {
    id: "learn-1",
    text: "Exclude churned accounts from pipeline math.",
    created_at: ISO,
    taught_by: { user_id: SELF_USER_ID, name: "Ada Lovelace" },
    mission_id: "act-1",
    mission_title: "Plan a trip to Tokyo",
  },
  {
    id: "learn-2",
    text: "Prefers metric units in every report.",
    created_at: ISO,
  },
];

export interface HostState {
  agents: CpAgent[];
  files: Map<string, string>;
  workspace: Map<string, { bytes: Buffer; created: number; modified: number }>;
  histories: Map<string, ChatMessage[]>;
  agentSeq: number;
  activitySeq: number;
  routineSeq: number;
  capabilities: FakeCapabilities;
  teamsSettings: TeamsSettings;
  computeUsage: ComputeUsageSeed | null;
  integrationsMode: IntegrationsMode;
  customIntegrations: CustomIntegrationSeed[] | null;
  orgMembers: FakeMember[] | null;
  meProfileBase: { displayName?: string; photoUrl?: string };
  meProfileCustom: { displayName: string | null; photoUrl: string | null };
  orgInvites: FakeInvite[];
  inviteSeq: number;
  teamWorkspaces: FakeTeamWorkspace[];
  spaceInvites: FakeSpaceInvite[];
  teamSeq: number;
  connections: Map<string, IntegrationConnection>;
  preferences: Map<string, string>;
  sidebarLayouts: Map<string, SidebarLayout>;
  connSeq: number;
}

export function fileKey(agentId: string, relPath: string): string {
  return `${agentId}:${relPath}`;
}

function freshState(): HostState {
  const files = new Map<string, string>();
  files.set(
    fileKey(SEED_AGENT_ID, ACTIVITY_PATH),
    JSON.stringify(SEED_ACTIVITIES),
  );
  files.set(
    fileKey(SEED_AGENT_ID, LEARNINGS_PATH),
    JSON.stringify(SEED_LEARNINGS),
  );
  const workspace = new Map<
    string,
    { bytes: Buffer; created: number; modified: number }
  >();
  workspace.set(fileKey(SEED_AGENT_ID, "Q3 report.pdf"), {
    bytes: Buffer.from("PDF-BYTES"),
    created: EPOCH,
    modified: EPOCH + 86_400_000,
  });
  workspace.set(fileKey(SEED_AGENT_ID, "Docs/sales.csv"), {
    bytes: Buffer.from("a,b\n1,2\n"),
    created: EPOCH,
    modified: EPOCH,
  });
  const connections = new Map<string, IntegrationConnection>([
    [
      "conn-gmail-0",
      { toolkit: "gmail", connectionId: "conn-gmail-0", status: "active" },
    ],
  ]);
  return {
    agents: [
      {
        id: SEED_AGENT_ID,
        workspaceId: SEED_WORKSPACE_ID,
        name: SEED_AGENT_NAME,
        createdAt: EPOCH,
      },
    ],
    files,
    workspace,
    histories: new Map(),
    agentSeq: 1,
    activitySeq: 2,
    routineSeq: 0,
    capabilities: { ...DEFAULT_CAPABILITIES },
    teamsSettings: { ...DEFAULT_TEAMS_SETTINGS },
    computeUsage: null,
    integrationsMode: "ready",
    customIntegrations: null,
    orgMembers: null,
    meProfileBase: {},
    meProfileCustom: { displayName: null, photoUrl: null },
    orgInvites: [],
    inviteSeq: 0,
    teamWorkspaces: [],
    spaceInvites: [],
    teamSeq: 0,
    connections,
    preferences: new Map(),
    sidebarLayouts: new Map(),
    connSeq: 1,
  };
}

export let state: HostState = freshState();

export function setRoutineSeq(next: number): void {
  state.routineSeq = Math.max(0, next);
}

export function reset(): void {
  state = freshState();
  resetArming();
  resetPlan();
  resetBillingChoice();
  resetProviders();
  resetSharedSkills();
  resetSkills();
  domainListeners.clear();
}

type DomainListener = (event: {
  type: string;
  agentPath?: string;
  workspaceId?: string;
}) => void;
const domainListeners = new Set<DomainListener>();

export function onDomainEvent(fn: DomainListener): () => void {
  domainListeners.add(fn);
  return () => domainListeners.delete(fn);
}
export function emitDomain(
  type: string,
  agentPath?: string,
  workspaceId = SEED_WORKSPACE_ID,
): void {
  for (const fn of domainListeners) fn({ type, agentPath, workspaceId });
}
export function emit(type: string, agentPath?: string): void {
  emitDomain(type, agentPath);
}

export const seedUsage = SEED_USAGE;
