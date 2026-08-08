/**
 * Where a file lives → what the user calls that place.
 *
 * The navigation labels are the product's own words: they come from
 * `app/src/locales/en/shell.json` → `sidebar` (Mission Control, Integrations,
 * Skills, AI Models, Agent Store, Settings, Your teams) plus
 * `sidebar.teamSections` (Mission Control, Routines, Files, Team Settings), all
 * wired in `app/src/components/shell/sidebar-chrome.tsx`.
 *
 * The remaining per-area labels below (Activity, Chat, Routines, Skills,
 * Integrations, Files, Archived, Permissions, Agent Settings) are HISTORICAL
 * names: they were the per-agent tab strip, which was deleted along with
 * `agents:tabLabels.*` and `app/src/agents/standard-tabs.ts`. Those surfaces
 * live on as team sections (Mission Control / Routines / Files) and as sections
 * of the agent settings page (job description, memory, people, apps, AI models,
 * skills). The names are kept because they are still how the team talks about
 * these component families, and a "Used in" chip is a wayfinding hint, not a
 * route. Rename a group only if the product's own word for it changes.
 *
 * Keys are repo-relative path prefixes and the **longest** match wins, so a
 * broad folder rule and the narrow exceptions inside it sit side by side in any
 * order. Folder keys end in `/`; a few keys are file-name prefixes, because
 * `app/src/components/` and `app/src/components/{shell,agent}/` each hold
 * several product areas at once.
 */
export const SURFACE_RULES = {
  // ── Agent surfaces (historical tab names, now sections) ────────────────
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
  // The per-agent Integrations tab is gone; only the shared allowlist editor
  // remains under this path, and it is the settings page's Apps section.
  "app/src/components/agent/agent-integrations/": "Agent Settings",

  "app/src/components/agent-file-preview-host": "Files",
  "app/src/components/file-preview-dialog": "Files",
  "app/src/components/move-conflict-dialog": "Files",
  "app/src/components/agent/files-": "Files",
  "app/src/components/agent/agent-files/": "Files",

  // The archive is cross-agent now, but its empty state still lives here.
  "app/src/components/agent/archived": "Archived",

  "app/src/components/permissions/": "Permissions",
  "app/src/components/agent/agent-access": "Permissions",
  "app/src/components/agent/agent-share": "Permissions",
  "app/src/components/agent/share-via-team": "Permissions",
  "app/src/components/agent/use-share-agent": "Permissions",

  "app/src/components/agent/agent-admin/": "Agent Settings",
  "app/src/components/agent/job-description": "Agent Settings",
  // Everything else under `components/agent/` — the per-agent component
  // family (renamed from `tabs/` when the tab strip went away). It holds the
  // shared surfaces the team sections and the agent settings page mount.
  // Anything landing here has no clearer home yet.
  "app/src/components/agent/": "Agent surfaces",

  // ── Sidebar rail + top-level views (shell:sidebar.*) ────────────────────
  "app/src/components/shell/": "App shell",
  "app/src/components/shell/agent-avatar": "Your Agents",
  "app/src/components/shell/agent-card-avatar": "Your Agents",
  "app/src/components/shell/agent-panel-avatar": "Your Agents",
  "app/src/components/shell/agent-sidebar-": "Your Agents",
  "app/src/components/shell/agent-warming-dialog": "Your Agents",
  "app/src/components/shell/experience-": "Your Agents",
  "app/src/components/shell/create-workspace-dialog": "Your Agents",
  "app/src/components/shell/workspace-dialog": "Your Agents",
  "app/src/components/agent-picker-dialog": "Your Agents",
  "app/src/components/shell/create-team-": "Organization",
  "app/src/components/shell/team-status-banner": "Organization",
  "app/src/components/shell/claude-browser-login": "AI Models",
  "app/src/components/shell/local-model-": "AI Models",
  "app/src/components/shell/openai-compatible-": "AI Models",
  "app/src/components/shell/provider-": "AI Models",
  "app/src/components/shell/agent-picker-step": "Onboarding",
  "app/src/components/shell/ai-": "Onboarding",
  "app/src/components/shell/disclaimer-gate": "Onboarding",
  "app/src/components/shell/language-gate": "Onboarding",
  "app/src/components/shell/naming-step": "Onboarding",
  "app/src/components/shell/workspace-setup-flow": "Onboarding",

  // The `team` screen behind every rail row: the team's board, its archive and
  // its settings. Named for the rail section that opens it
  // (shell:sidebar.yourTeams), not for the stored group it draws.
  "app/src/components/team-view/": "Your teams",
  // A team's sections are the surfaces those ideas wear now, so they keep the
  // section's own name rather than the rail block's.
  "app/src/components/team-view/team-routines/": "Routines",
  "app/src/components/team-view/team-files/": "Files",

  "app/src/components/ai-hub/": "AI Models",
  "app/src/components/provider-browser/": "AI Models",
  "app/src/components/provider-switch-dialog": "AI Models",
  "app/src/components/store-view/": "Agent Store (in app)",
  "app/src/components/organization/": "Organization",
  "app/src/components/settings/": "Settings",
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

  // ── The other frontends ────────────────────────────────────────────────
  "packages/web/src/": "Web app",
  "packages/web/src/admin/": "Web app (admin)",
  "agentstore/src/": "Store website",
  "agentstore/src/app/admin/": "Store website (admin)",
};

/**
 * The surface label for a repo-relative path.
 *
 * A `ui/<pkg>/src/**` file is labelled as the library it is, and anything no
 * rule claims falls back to its top-level folder rather than being dropped: an
 * unlabelled hit still tells the truth about where a component is used, and it
 * is exactly how a missing rule makes itself visible.
 */
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
