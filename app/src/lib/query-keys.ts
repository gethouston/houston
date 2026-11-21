import { orgQueryKeys } from "./query-keys-org";

export const queryKeys = {
  activity: (agentPath: string) => ["activity", agentPath] as const,
  skills: (agentPath: string) => ["skills", agentPath] as const,
  skillsManifest: (agentPath: string) =>
    ["skills-manifest", agentPath] as const,
  sharedSkills: (workspaceId: string) =>
    ["shared-skills", workspaceId] as const,
  sharedSkillDetail: (workspaceId: string, slug: string) =>
    ["shared-skills", workspaceId, "detail", slug] as const,
  skillDetail: (agentPath: string, name: string) =>
    ["skill-detail", agentPath, name] as const,
  files: (agentPath: string) => ["files", agentPath] as const,
  filePreviewPdfs: (agentPath: string) =>
    ["file-preview-pdf", agentPath] as const,
  filePreviewPdf: (
    agentPath: string,
    filePath: string | null,
    lang: string,
    modified?: number,
    size?: number,
  ) => ["file-preview-pdf", agentPath, filePath, lang, modified, size] as const,
  instructions: (agentPath: string) => ["instructions", agentPath] as const,
  workspaceContext: (agentPath: string) =>
    ["workspace-context", agentPath] as const,
  config: (agentPath: string) => ["config", agentPath] as const,
  routines: (agentPath: string) => ["routines", agentPath] as const,
  learnings: (agentPath: string) => ["learnings", agentPath] as const,
  routineRuns: (agentPath: string) => ["routine-runs", agentPath] as const,
  allConversations: (agentPaths: readonly string[]) =>
    ["all-conversations", ...agentPaths] as const,
  chatHistory: (agentPath: string, sessionKey: string) =>
    ["chat-history", agentPath, sessionKey] as const,
  chatHistoryForAgent: (agentPath: string) =>
    ["chat-history", agentPath] as const,

  providerStatuses: (providers?: readonly string[] | null) =>
    providers
      ? (["provider-statuses", ...providers] as const)
      : (["provider-statuses"] as const),
  capabilities: () => ["capabilities"] as const,
  assistant: (spaceId: string | null) => ["assistant", spaceId] as const,
  heartbeat: () => ["heartbeat"] as const,
  preferences: () => ["preferences"] as const,
  nextStepSuggestions: () => ["preferences", "next_step_suggestions"] as const,

  onboardingPending: () => ["onboarding-pending"] as const,
  onboardingCompleted: (uid: string | null) =>
    ["onboarding-completed", uid] as const,

  session: () => ["session"] as const,

  providerUsage: () => ["provider-usage"] as const,

  apiKeys: () => ["api-keys"] as const,

  channels: (spaceId?: string) => ["channels", spaceId] as const,
  linkedInConnection: () => ["linkedin-connection"] as const,

  sidebarLayout: (workspaceId: string) =>
    ["sidebar-layout", workspaceId] as const,

  migrationReconnect: () => ["migration-reconnect"] as const,
  migrationReconnectDismissed: () => ["migration-reconnect-dismissed"] as const,

  cloudMigrationDetect: () => ["cloud-migration-detect"] as const,

  integrationStatus: () => ["integration-status"] as const,
  integrationConnections: (provider: string) =>
    ["integration-connections", provider] as const,
  integrationToolkits: (provider: string) =>
    ["integration-toolkits", provider] as const,
  customIntegrations: () => ["custom-integrations"] as const,
  agentCustomIntegrations: (agentId: string) =>
    ["custom-integrations", agentId] as const,

  ...orgQueryKeys,
};
