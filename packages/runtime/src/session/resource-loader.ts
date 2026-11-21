import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { renderJobDescriptionForPrompt } from "@houston/domain";
import type { AssistantRuntimeRole } from "@houston/domain/assistant-role";
import type { TurnMode } from "@houston/protocol";
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

export function systemPromptFor(codeExecution: CodeExecutionMode): string {
  return [
    "You are a friendly AI assistant inside Houston, working for a non-technical user.",
    codeExecutionSentence(codeExecution),
    "Be clear and concise. Avoid jargon. Never mention file paths, JSON, or configs unless asked.",
  ].join("\n");
}

export function codeExecutionSentence(
  codeExecution: CodeExecutionMode,
): string {
  return codeExecution === "disabled"
    ? "You can read and edit files in the user's working directory to help them. You cannot run shell commands or execute code; never claim that you can."
    : "You can read and edit files and run commands in the user's working directory to help them.";
}

export const SYSTEM_PROMPT = systemPromptFor(config.codeExecution);

const CONTEXT_CANDIDATES = ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];

function loadWorkspaceContextFile(
  cwd: string,
): Array<{ path: string; content: string }> {
  for (const name of CONTEXT_CANDIDATES) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    const content = renderJobDescriptionForPrompt(readFileSync(path, "utf8"));
    return [{ path, content }];
  }
  return [];
}

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

  return new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir: opts.cwd,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    extensionFactories: [makeCompactionGuard()],
    additionalSkillPaths,
    skillsOverride: agentSkillsOverride(sharedSkillsDir, enabledSharedSkills),
    agentsFilesOverride: () => ({
      agentsFiles: loadWorkspaceContextFile(opts.cwd),
    }),
    systemPrompt: opts.systemPrompt,
  });
}

export function makeAgentLoader(
  cwd: string,
  mode?: TurnMode,
  provided?: ProvidedContext,
  basePrompt?: string,
  sharedSkillsDir: string = config.sharedSkillsDir,
  role?: AssistantRuntimeRole | null,
) {
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
