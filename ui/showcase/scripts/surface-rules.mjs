export const SURFACE_RULES = {
  "app/src/components/board/": "Activity",
  "app/src/components/cards/": "Activity",
  "app/src/components/mission-": "Activity",
  "app/src/components/new-mission-": "Activity",
  "app/src/components/use-mission-": "Activity",
  "app/src/components/use-person-filter-mode": "Activity",
  "app/src/components/dashboard": "Mission Control",

  "app/src/components/chat-": "Chat",
  "app/src/components/use-chat-": "Chat",
  "app/src/components/use-agent-chat-": "Chat",
  "app/src/components/context-": "Chat",
  "app/src/components/effort-icon": "Chat",
  "app/src/components/file-card": "Chat",
  "app/src/components/attachment-": "Chat",
  "app/src/components/turn-file-summary": "Chat",
  "app/src/components/tool-runtime-": "Chat",
  "app/src/components/use-interaction-": "Chat",
  "app/src/components/use-queued-message-": "Chat",

  "app/src/components/agent/automation-intake/": "Routines",
  "app/src/components/agent/routine": "Routines",
  "app/src/components/agent/use-routine": "Routines",
  "app/src/components/agent/webhook-": "Routines",

  "app/src/components/skill-": "Skills",
  "app/src/components/skills-view/": "Skills",
  "app/src/components/selected-skill-": "Skills",
  "app/src/components/user-skill-": "Skills",
  "app/src/components/agent/skill": "Skills",
  "app/src/components/agent/installed-skills": "Skills",
  "app/src/components/agent/learning": "Skills",
  "app/src/components/agent/use-skill": "Skills",
  "app/src/components/agent/use-community-skill": "Skills",

  "app/src/components/integrations/": "Integrations",
  "app/src/components/integrations-view/": "Integrations",
  "app/src/components/integration-connect-": "Integrations",
  "app/src/components/use-integration-connect": "Integrations",
  "app/src/components/use-action-brand-resolver": "Integrations",
  "app/src/components/use-toolkit-brand-resolver": "Integrations",
  "app/src/components/agent/agent-integrations/": "Agent Settings",

  "app/src/components/file-preview/": "Files",
  "app/src/components/move-conflict-dialog": "Files",
  "app/src/components/agent/files-": "Files",
  "app/src/components/agent/agent-files/": "Files",

  "app/src/components/agent/archived": "Archived",

  "app/src/components/permissions/": "Permissions",
  "app/src/components/agent/agent-access": "Permissions",
  "app/src/components/agent/agent-share": "Permissions",
  "app/src/components/agent/share-via-team": "Permissions",
  "app/src/components/agent/use-share-agent": "Permissions",

  "app/src/components/agent/agent-admin/": "Agent Settings",
  "app/src/components/agent/job-description": "Agent Settings",
  "app/src/components/agent/": "Agent surfaces",

  "app/src/components/shell/": "App shell",
  "app/src/components/shell/agent-card-avatar": "Your Agents",
  "app/src/components/shell/agent-panel-avatar": "Your Agents",
  "app/src/components/shell/agent-sidebar-": "Your Agents",
  "app/src/components/shell/agent-warming-dialog": "Your Agents",
  "app/src/components/shell/add-to-workspace-sheet": "Your Agents",
  "app/src/components/shell/add-choice-step": "Your Agents",
  "app/src/components/shell/workspace-dialog": "Your Agents",
  "app/src/components/agent-picker-dialog": "Your Agents",
  "app/src/components/employee-card/": "Your Agents",
  "app/src/components/shell/create-team-": "Organization",
  "app/src/components/shell/team-status-banner": "Organization",
  "app/src/components/shell/claude-browser-login": "AI Models",
  "app/src/components/shell/local-model-": "AI Models",
  "app/src/components/shell/openai-compatible-": "AI Models",
  "app/src/components/shell/provider-": "AI Models",
  "app/src/components/shell/ai-": "Onboarding",
  "app/src/components/shell/language-gate": "Onboarding",
  "app/src/components/shell/naming-step": "Onboarding",
  "app/src/components/shell/workspace-setup-flow": "Onboarding",

  "app/src/components/team-view/": "Your AI Employees",
  "app/src/components/team-view/team-routines/": "Routines",
  "app/src/components/team-view/team-files/": "Files",

  "app/src/components/ai-hub/": "AI Models",
  "app/src/components/provider-browser/": "AI Models",
  "app/src/components/provider-switch-dialog": "AI Models",
  "app/src/components/organization/": "Organization",
  "app/src/components/settings/": "Settings",
  "app/src/components/account/": "Your account",
  "app/src/components/dictation-setup-dialog": "Settings",
  "app/src/components/onboarding/": "Onboarding",
  "app/src/components/auth/": "Sign in",
  "app/src/components/portable/": "Import & export",
  "app/src/components/command-palette": "App shell",
  "app/src/components/shortcut-cheatsheet": "App shell",
  "app/src/hooks/": "App shell",
  "app/src/lib/": "App shell",
  "app/src/App.tsx": "App shell",
  "app/src/identity-keyed-app.tsx": "App shell",
  "app/src/main.tsx": "App shell",

  "packages/web/src/": "Web app",
  "packages/web/src/admin/": "Web app (admin)",
  "agentstore/src/": "Store website",
  "agentstore/src/app/admin/": "Store website (admin)",
};

export function surfaceOf(path) {
  let label;
  let longest = -1;
  for (const [prefix, name] of Object.entries(SURFACE_RULES)) {
    if (path.startsWith(prefix) && prefix.length > longest) {
      longest = prefix.length;
      label = name;
    }
  }
  if (label) return label;
  const library = /^ui\/([^/]+)\/src\//.exec(path);
  if (library) return `ui/${library[1]} (library)`;
  const folder = path.split("/").slice(0, -1);
  return folder.slice(0, 3).join("/");
}
