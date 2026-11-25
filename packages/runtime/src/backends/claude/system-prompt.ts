import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatSkillsForPrompt,
  loadSkillsFromDir,
} from "@earendil-works/pi-coding-agent";
import { renderJobDescriptionForPrompt } from "@houston/domain";
import type { AssistantRuntimeRole } from "@houston/domain/assistant-role";
import type { TurnMode } from "@houston/protocol";
import { config } from "../../config";
import { buildAssistantRulesSection } from "../../session/assistant-rules-context";
import { buildLearningsSection } from "../../session/learnings-context";
import { withModeOverlay } from "../../session/mode-overlays";
import { skillsForPrompt } from "../../session/prompt-skills";
import {
  buildWorkspaceContextSection,
  type ProvidedContext,
} from "../../session/workspace-context";
import { HOUSTON_MCP_SERVER_NAME } from "./custom-tools";

const CONTEXT_CANDIDATES = ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];

const TOOL_NAMES_NOTE = `Houston's own tools reach you as \`mcp__${HOUSTON_MCP_SERVER_NAME}__<name>\`, for example \`mcp__${HOUSTON_MCP_SERVER_NAME}__ask_user\`; these instructions call each one by its plain name.`;

export function buildSystemPrompt(
  cwd: string,
  systemPrompt: string,
  mode?: TurnMode,
  provided?: ProvidedContext,
  role?: AssistantRuntimeRole | null,
): string {
  const context = loadWorkspaceContextFile(cwd);
  const product = `${systemPrompt}\n\n${TOOL_NAMES_NOTE}`;
  const base = context ? `${product}\n\n${context}` : product;
  const section = buildWorkspaceContextSection(cwd, provided);
  const withContext = section ? `${base}\n\n${section}` : base;
  const learnings = buildLearningsSection(cwd, role);
  const withLearnings = learnings
    ? `${withContext}\n\n${learnings}`
    : withContext;
  const rules = buildAssistantRulesSection(role);
  const withRules = rules ? `${withLearnings}\n\n${rules}` : withLearnings;
  const withSkills = withRules + buildSkillsSection(cwd);
  return withModeOverlay(withSkills, mode);
}

// WHY: settingSources: [] and the disabled Skill tool turn off the SDK's skill discovery. ADR-0009
function buildSkillsSection(cwd: string): string {
  const dir = config.skillsDirOverride || join(cwd, ".agents", "skills");
  if (!existsSync(dir)) return "";
  const { skills } = loadSkillsFromDir({ dir, source: "path" });
  return formatSkillsForPrompt(skillsForPrompt(skills));
}

function loadWorkspaceContextFile(cwd: string): string | null {
  for (const name of CONTEXT_CANDIDATES) {
    const path = join(cwd, name);
    if (existsSync(path))
      return renderJobDescriptionForPrompt(readFileSync(path, "utf8"));
  }
  return null;
}
