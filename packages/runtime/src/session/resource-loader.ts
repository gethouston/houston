import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { renderJobDescriptionForPrompt } from "@houston/domain";
import type { TurnMode } from "@houston/protocol";
import { config } from "../config";
import { buildAssistantRulesSection } from "./assistant-rules-context";
import { makeCompactionGuard } from "./compaction-guard";
import { buildLearningsSection } from "./learnings-context";
import { withModeOverlay } from "./mode-overlays";
import { loadSkillsManifest } from "./skills-manifest";
import type { CodeExecutionMode } from "./tool-selection-types";
import {
  buildWorkspaceContextSection,
  type ProvidedContext,
} from "./workspace-context";

/**
 * The base prompt for a runtime that may execute code the given way. The
 * capability sentence must match the tool allowlist: a session with no bash and
 * no run_code must not be told it can "run commands", or the model claims an
 * ability it lacks. It is a PARAMETER rather than a read of `config` because a
 * pooled turn decides per turn — a worker configured for `remote` runs with
 * code execution disabled on a turn whose grant withheld the `code-run` scope.
 */
export function systemPromptFor(codeExecution: CodeExecutionMode): string {
  return [
    "You are Houston, a friendly AI assistant for a non-technical user.",
    codeExecution === "disabled"
      ? "You can read and edit files in the user's working directory to help them. You cannot run shell commands or execute code; never claim that you can."
      : "You can read and edit files and run commands in the user's working directory to help them.",
    "Be clear and concise. Avoid jargon. Never mention file paths, JSON, or configs unless asked.",
  ].join("\n");
}

/** This process's own base prompt (the long-lived runtime's one answer). */
export const SYSTEM_PROMPT = systemPromptFor(config.codeExecution);

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
    // The job description is structured (`industry`/`role` frontmatter + the
    // free description): the model reads those two as plain lines, never YAML.
    const content = renderJobDescriptionForPrompt(readFileSync(path, "utf8"));
    return [{ path, content }];
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
  /**
   * The base prompt to compose onto. Absent = this PROCESS's answer, which is
   * right for a long-lived runtime. A pooled turn passes its own, because its
   * code-execution capability is decided per turn (the grant's `code-run`
   * scope), and the sentence about running commands must match the tools the
   * turn actually got.
   */
  basePrompt?: string,
) {
  // Workspace and user context precede saved memory, operating rules, and
  // the turn mode overlay. Agent instructions load through agentsFilesOverride.
  const section = buildWorkspaceContextSection(cwd, provided);
  const base = basePrompt || config.systemPrompt || SYSTEM_PROMPT;
  const withContext = section ? `${base}\n\n${section}` : base;
  const learnings = buildLearningsSection(cwd);
  const withLearnings = learnings
    ? `${withContext}\n\n${learnings}`
    : withContext;
  const rules = buildAssistantRulesSection();
  const withRules = rules ? `${withLearnings}\n\n${rules}` : withLearnings;
  return buildAgentLoader({
    cwd,
    skillsDir: config.skillsDirOverride || join(cwd, ".agents", "skills"),
    sharedSkillsDir: config.sharedSkillsDir,
    systemPrompt: withModeOverlay(withRules, mode),
  });
}
