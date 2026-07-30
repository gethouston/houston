import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import type { TurnMode } from "@houston/protocol";
import { config } from "../config";
import { makeCompactionGuard } from "./compaction-guard";
import { withModeOverlay } from "./mode-overlays";
import { loadSkillsManifest } from "./skills-manifest";
import {
  buildGroupContextSection,
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
 * context file (CLAUDE.md/AGENTS.md, root only), agent-local skills, and only
 * the workspace-shared skills enabled by this agent's manifest. pi's broader
 * on-disk discovery (extensions, prompt templates, themes, the ancestor
 * context-file walk, pi's default skill dirs) stays disabled — what an agent
 * sees is decided here, not by whatever is lying around on disk. Caller must
 * await loader.reload() before use.
 */
export function buildAgentLoader(opts: {
  cwd: string;
  skillsDir: string;
  sharedSkillsDir?: string;
  systemPrompt: string;
}) {
  const sharedSkillsDir =
    opts.sharedSkillsDir && existsSync(opts.sharedSkillsDir)
      ? realpathSync(opts.sharedSkillsDir)
      : null;
  const enabledSharedSkills = new Set(
    sharedSkillsDir ? loadSkillsManifest(opts.cwd).enabled : [],
  );
  const additionalSkillPaths = [
    ...(existsSync(opts.skillsDir) ? [opts.skillsDir] : []),
    ...(sharedSkillsDir ? [sharedSkillsDir] : []),
  ];

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
    additionalSkillPaths,
    skillsOverride: sharedSkillsDir
      ? ({ skills, diagnostics }) => {
          const isShared = (baseDir: string) =>
            isWithin(realpathSync(baseDir), sharedSkillsDir);
          const localNames = new Set(
            skills
              .filter((skill) => !isShared(skill.baseDir))
              .map((skill) => skill.name),
          );
          return {
            skills: skills.filter(
              (skill) =>
                !isShared(skill.baseDir) ||
                (enabledSharedSkills.has(skill.name) &&
                  !localNames.has(skill.name)),
            ),
            diagnostics,
          };
        }
      : undefined,
    agentsFilesOverride: () => ({
      agentsFiles: loadWorkspaceContextFile(opts.cwd),
    }),
    systemPrompt: opts.systemPrompt,
  });
}

function isWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(root + sep);
}

/**
 * Config-bound loader for an agent session. Agent-local skills come from
 * <workspace>/.agents/skills unless HOUSTON_SKILLS_DIR overrides; an existing
 * HOUSTON_SHARED_SKILLS_DIR contributes manifest-filtered workspace-shared skills.
 */
export function makeAgentLoader(
  cwd: string,
  mode?: TurnMode,
  provided?: ProvidedContext,
) {
  // Overlays compose onto Houston's base prompt, in the SAME order as the claude
  // backend (system-prompt.ts): first the workspace + user CONTEXT section
  // (HOU-711 — `provided` is the gateway's Supabase copy in cloud, else the two
  // files at cwd), then the GROUP context section (local-only `GROUP.md` the host
  // mirrors into each grouped agent's cwd; null when ungrouped), then the turn
  // MODE overlay LAST so the plan/auto mandate is the final word. CLAUDE.md/
  // AGENTS.md still load via agentsFilesOverride below.
  const section = buildWorkspaceContextSection(cwd, provided);
  const base = config.systemPrompt || SYSTEM_PROMPT;
  const withContext = section ? `${base}\n\n${section}` : base;
  const group = buildGroupContextSection(cwd);
  const withGroup = group ? `${withContext}\n\n${group}` : withContext;
  return buildAgentLoader({
    cwd,
    skillsDir: config.skillsDirOverride || join(cwd, ".agents", "skills"),
    sharedSkillsDir: config.sharedSkillsDir,
    systemPrompt: withModeOverlay(withGroup, mode),
  });
}
