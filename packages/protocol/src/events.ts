export type HoustonEvent =
  | { type: "ActivityChanged"; agentPath: string }
  | { type: "RoutinesChanged"; agentPath: string }
  | { type: "RoutineRunsChanged"; agentPath: string }
  | { type: "ConfigChanged"; agentPath: string }
  | { type: "LearningsChanged"; agentPath: string }
  | { type: "SkillsChanged"; agentPath: string }
  | { type: "ContextChanged"; agentPath: string }
  | { type: "AgentRoleChanged"; agentPath: string }
  | { type: "FilesChanged"; agentPath: string }
  | { type: "ConversationsChanged"; agentPath: string }
  | { type: "WorkspacesChanged" }
  | { type: "AgentsChanged"; workspaceId: string }
  | { type: "SharedSkillsChanged"; workspaceId: string }
  | { type: "SidebarLayoutChanged"; workspaceId: string }
  | { type: "Toast"; level: "info" | "error"; message: string }
  | { type: "CompletionToast"; agentPath: string; title: string; body: string }
  | { type: "AuthRequired"; provider: string }
  | { type: "CustomIntegrationsChanged" }
  | { type: "HeartbeatDelivered"; agentPath: string; date: string }
  | { type: "HeartbeatChanged"; workspaceId: string }
  | { type: "PreferencesChanged"; workspaceId: string };

export type HoustonEventType = HoustonEvent["type"];
