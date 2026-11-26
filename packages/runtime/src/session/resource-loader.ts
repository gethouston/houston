import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { renderJobDescriptionForPrompt } from "@houston/domain";
import type { AssistantRuntimeRole } from "@houston/domain/assistant-role";
import type { TurnMode } from "@houston/protocol";
import { makeProviderResponseRecorder } from "../ai/provider-response";
import { config } from "../config";
import { buildAssistantRulesSection } from "./assistant-rules-context";
import { makeCompactionGuard } from "./compaction-guard";
import { buildLearningsSection } from "./learnings-context";
import { withModeOverlay } from "./mode-overlays";
import { agentSkillsOverride } from "./prompt-skills";
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
    "You are a friendly AI assistant inside Houston, working for a non-technical user.",
    codeExecutionSentence(codeExecution),
    "Be clear and concise. Avoid jargon. Never mention file paths, JSON, or configs unless asked.",
  ].join("\n");
}

/** What this session may do with the workspace, in one sentence. */
export function codeExecutionSentence(
  codeExecution: CodeExecutionMode,
): string {
  return codeExecution === "disabled"
    ? "You can read and edit files in the user's working directory to help them. You cannot run shell commands or execute code; never claim that you can."
    : "You can read and edit files and run commands in the user's working directory to help them.";
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
    // within the model's window — see compaction-guard.ts (HOU-709). The
    // recorder keeps each failed request's status and request id for its
    // error card (ai/provider-response.ts).
    extensionFactories: [makeCompactionGuard(), makeProviderResponseRecorder()],
    additionalSkillPaths,
    skillsOverride: agentSkillsOverride(sharedSkillsDir, enabledSharedSkills),
    agentsFilesOverride: () => ({
      agentsFiles: loadWorkspaceContextFile(opts.cwd),
    }),
    systemPrompt: opts.systemPrompt,
  });
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
  /**
   * The workspace-shared skills directory. Absent = this process's mirror; a
   * pooled turn passes its own org's per-turn snapshot, since one worker
   * process serves every org.
   */
  sharedSkillsDir: string = config.sharedSkillsDir,
  /** The coordinator role for THIS session. Absent = the process's own; a
   *  pooled turn passes the turn's, `null` included. */
  role?: AssistantRuntimeRole | null,
) {
  // Workspace and user context precede saved memory, operating rules, and
  // the turn mode overlay. Agent instructions load through agentsFilesOverride.
  const section = buildWorkspaceContextSection(cwd, provided);
  const base = basePrompt || config.systemPrompt || SYSTEM_PROMPT;
  const withContext = section ? `${base}\n\n${section}` : base;
  const learnings = buildLearningsSection(cwd, role);
  const withLearnings = learnings
    ? `${withContext}\n\n${learnings}`
    : withContext;
  const rules = buildAssistantRulesSection(role);
  const withRules = rules ? `${withLearnings}\n\n${rules}` : withLearnings;
  return buildAgentLoader({
    cwd,
    skillsDir: config.skillsDirOverride || join(cwd, ".agents", "skills"),
    sharedSkillsDir,
    systemPrompt: withModeOverlay(withRules, mode),
  });
}
