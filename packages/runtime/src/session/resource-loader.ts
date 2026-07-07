import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import type { TurnMode } from "@houston/protocol";
import { config } from "../config";
import { makeCompactionGuard } from "./compaction-guard";
import { withModeOverlay } from "./mode-overlays";
import {
  buildWorkspaceContextSection,
  type ProvidedContext,
} from "./workspace-context";

export const SYSTEM_PROMPT = [
  "You are Houston, a friendly AI assistant for a non-technical user.",
  "You can read and edit files and run commands in the user's working directory to help them.",
  "Be clear and concise. Avoid jargon. Never mention file paths, JSON, or configs unless asked.",
].join("\n");

/**
 * Workspace-root context file (the agent's role/instructions). Same candidate
 * names pi itself discovers, but ONLY at the workspace root: pi's own discovery
 * walks every ancestor directory up to /, which would leak context files from
 * OUTSIDE the workspace — outside the file-tool clamp (Gate #1).
 */
const CONTEXT_CANDIDATES = ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];

function loadWorkspaceContextFile(
  cwd: string,
): Array<{ path: string; content: string }> {
  for (const name of CONTEXT_CANDIDATES) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    return [{ path, content: readFileSync(path, "utf8") }];
  }
  return [];
}

/**
 * Pure, parameterized loader builder: our system prompt, the workspace's own
 * context file (CLAUDE.md/AGENTS.md, root only), and SKILL.md skills from the
 * given skills dir. pi's broader on-disk discovery (extensions, prompt
 * templates, themes, the ancestor context-file walk, pi's default skill dirs)
 * stays disabled — what an agent sees is decided here, not by whatever is
 * lying around on disk. Caller must await loader.reload() before use.
 */
export function buildAgentLoader(opts: {
  cwd: string;
  skillsDir: string;
  systemPrompt: string;
}) {
  // noSkills disables pi's DEFAULT skill directories; additionalSkillPaths
  // still load (pi gates on `noSkills && skillPaths.length === 0`).
  return new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir: opts.cwd,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    // Inline factories load even with noExtensions (that flag only gates
    // on-disk discovery). The guard keeps compaction's summarization request
    // within the model's window — see compaction-guard.ts (HOU-709).
    extensionFactories: [makeCompactionGuard()],
    additionalSkillPaths: existsSync(opts.skillsDir) ? [opts.skillsDir] : [],
    agentsFilesOverride: () => ({
      agentsFiles: loadWorkspaceContextFile(opts.cwd),
    }),
    systemPrompt: opts.systemPrompt,
  });
}

/**
 * Config-bound loader for an agent session. Skills come from
 * <workspace>/.agents/skills (Agent Skills standard — Houston's existing
 * on-disk layout loads as-is) unless HOUSTON_SKILLS_DIR overrides.
 */
export function makeAgentLoader(
  cwd: string,
  mode?: TurnMode,
  provided?: ProvidedContext,
) {
  // Two overlays compose onto Houston's base prompt, in the SAME order as the
  // claude backend (system-prompt.ts): first the workspace + user CONTEXT section
  // (HOU-711 — `provided` is the gateway's Supabase copy in cloud, else the two
  // files at cwd), then the turn MODE overlay LAST so the plan/auto mandate is the
  // final word. CLAUDE.md/AGENTS.md still load via agentsFilesOverride below.
  const section = buildWorkspaceContextSection(cwd, provided);
  const base = config.systemPrompt || SYSTEM_PROMPT;
  const withContext = section ? `${base}\n\n${section}` : base;
  return buildAgentLoader({
    cwd,
    skillsDir: config.skillsDirOverride || join(cwd, ".agents", "skills"),
    systemPrompt: withModeOverlay(withContext, mode),
  });
}
