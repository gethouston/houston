import { lazy, type ComponentType } from "react";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as jsxRuntime from "react/jsx-runtime";
import type { AgentTab, AgentDefinition, TabProps } from "../lib/types";

// Expose React on window so IIFE agent bundles can access it via globals
(window as any).Houston = { React, ReactDOM, jsxRuntime };
import ChatTab from "../components/tabs/chat-tab";
import BoardTab from "../components/tabs/board-tab";
import FilesTab from "../components/tabs/files-tab";
import ConnectionsTab from "../components/tabs/connections-tab";
import IntegrationsTab from "../components/tabs/integrations-tab";
import JobDescriptionTab from "../components/tabs/job-description-tab";
import RoutinesTab from "../components/tabs/routines-tab";
import EventsTab from "../components/tabs/events-tab";
import ConfigureTab from "../components/tabs/configure-tab";
import PromptsTab from "../components/tabs/prompts-tab";
import LearningsTab from "../components/tabs/learnings-tab";
import SkillsTab from "../components/tabs/skills-tab";
import ConfigTab from "../components/tabs/config-tab";
import GitTab from "../components/tabs/git-tab";

const BUILTIN_TABS: Record<string, ComponentType<TabProps>> = {
  chat: ChatTab,
  board: BoardTab,
  files: FilesTab,
  integrations: IntegrationsTab,
  connections: ConnectionsTab,
  "job-description": JobDescriptionTab,
  routines: RoutinesTab,
  events: EventsTab,
  configure: ConfigureTab,
  prompts: PromptsTab,
  learnings: LearningsTab,
  skills: SkillsTab,
  config: ConfigTab,
  git: GitTab,
};

// Cache for custom bundle components so they're not re-created on every render
const bundleCache = new Map<string, ComponentType<TabProps>>();

export function resolveTabComponent(
  tab: AgentTab,
  agentDef: AgentDefinition,
): ComponentType<TabProps> {
  // Built-in tab — eager, no loading delay
  if (tab.builtIn && BUILTIN_TABS[tab.builtIn]) {
    return BUILTIN_TABS[tab.builtIn];
  }

  // Custom component from bundle (tier 2) — lazy with cache
  // Bundles are IIFE format that access React via window.Houston globals.
  // We read the JS, evaluate it via <script>, and read exports from window.
  if (tab.customComponent && agentDef.path) {
    const cacheKey = `${agentDef.path}:${tab.customComponent}`;
    if (!bundleCache.has(cacheKey)) {
      const componentName = tab.customComponent;
      const component = lazy(async () => {
        try {
          const { tauriAgent } = await import("../lib/tauri");
          const code = await tauriAgent.readFile(agentDef.path!, "bundle.js");
          // Evaluate the IIFE — it assigns exports to window.__houston_bundle__
          const script = document.createElement("script");
          script.textContent = code;
          document.head.appendChild(script);
          document.head.removeChild(script);
          // Read and clean up the global
          const exports = (window as any).__houston_bundle__;
          (window as any).__houston_bundle__ = undefined;
          if (!exports) throw new Error("Bundle did not register exports");
          const Component = exports[componentName];
          if (!Component) throw new Error(`Bundle does not export "${componentName}"`);
          return { default: Component };
        } catch (err) {
          console.error(`[tab-resolver] Failed to load custom tab "${componentName}":`, err);
          return { default: BundleError as ComponentType<any> };
        }
      });
      bundleCache.set(cacheKey, component);
    }
    return bundleCache.get(cacheKey)!;
  }

  // Fallback
  return BUILTIN_TABS.chat;
}

/** Shown when a custom tab's bundle.js is missing or fails to load. */
function BundleError() {
  return React.createElement("div", {
    style: {
      display: "flex", flexDirection: "column" as const, alignItems: "center",
      justifyContent: "center", height: "100%", gap: 8, padding: 32,
    },
  },
    React.createElement("p", {
      style: { fontSize: 20, fontWeight: 600, color: "#0d0d0d" },
    }, "Custom tab unavailable"),
    React.createElement("p", {
      style: { fontSize: 14, color: "#676767", textAlign: "center" as const, maxWidth: 400 },
    }, "This agent has a custom component but its bundle.js is missing or failed to load. Reinstall the agent or check the agent repo."),
  );
}
