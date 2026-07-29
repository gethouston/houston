import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatSkillsForPrompt,
  loadSkillsFromDir,
} from "@earendil-works/pi-coding-agent";
import type { TurnMode } from "@houston/protocol";
import { config } from "../../config";
import { withModeOverlay } from "../../session/mode-overlays";
import {
  buildGroupContextSection,
  buildWorkspaceContextSection,
  type ProvidedContext,
} from "../../session/workspace-context";

/**
 * Build the full-replace `systemPrompt` string for a Claude session: Houston's
 * own prompt followed by the workspace-root context file when present.
 *
 * This mirrors `session/resource-loader.ts` (which builds the equivalent for pi):
 * the context file is read ONLY from the workspace root, never from an ancestor
 * directory, so a CLAUDE.md/AGENTS.md sitting OUTSIDE the workspace can't leak in
 * past the file-tool clamp. The result is passed as a plain string to the SDK
 * (not the `claude_code` preset), so the agent sees exactly this and nothing the
 * SDK would otherwise discover on disk.
 *
 * `resource-loader.ts` keeps its loader private (it hands pi a `ResourceLoader`,
 * not a string), so the root-only candidate list is mirrored here rather than
 * imported — the two must stay in step.
 */
const CONTEXT_CANDIDATES = ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"];

export function buildSystemPrompt(
  cwd: string,
  systemPrompt: string,
  mode?: TurnMode,
  provided?: ProvidedContext,
): string {
  const context = loadWorkspaceContextFile(cwd);
  const base = context ? `${systemPrompt}\n\n${context}` : systemPrompt;
  // Workspace + user context section next (HOU-711), injected exactly as the pi
  // backend does (session/resource-loader.ts) so both engines see the same slots.
  // `provided` is the gateway's Supabase copy (cloud), else the cwd files (local).
  const section = buildWorkspaceContextSection(cwd, provided);
  const withContext = section ? `${base}\n\n${section}` : base;
  // Group context section AFTER workspace/user (HOU-711), local-only: `GROUP.md`
  // the host mirrors into each grouped agent's cwd from its sidebar group's
  // shared context. Null for ungrouped agents.
  const group = buildGroupContextSection(cwd);
  const withGroup = group ? `${withContext}\n\n${group}` : withContext;
  // Skills index (HOU-894): the SAME <available_skills> section pi appends for
  // every other provider — name + description + the SKILL.md path to Read. The
  // SDK's own skill discovery is off (`settingSources: []`, `Skill` disallowed),
  // so without this an Anthropic session had NO idea what skills exist or where
  // their files live, and a "Use the <skill> skill." turn ran blind.
  const withSkills = withGroup + buildSkillsSection(cwd);
  // Mode overlay LAST — after Houston's prompt, the context file, both context
  // sections, AND the skills index — so the plan (read-only) or auto (Autopilot)
  // mandate is the final word the model reads. Execute passes through unchanged.
  return withModeOverlay(withSkills, mode);
}

/**
 * The `<available_skills>` index for the workspace's skills dir, or "" when
 * there are none. Reuses pi's own loader + formatter so both backends surface
 * the IDENTICAL section from the IDENTICAL directory (`HOUSTON_SKILLS_DIR`
 * override, else `<cwd>/.agents/skills` — mirroring `makeAgentLoader`), with
 * the same rules: a skill with no `description:` is dropped, and every entry
 * carries the absolute SKILL.md `<location>` for the Read tool. Skill paths sit
 * inside the workspace, so the Gate #1 clamp lets the model read them. Plan
 * mode keeps the section — Read stays available there.
 */
function buildSkillsSection(cwd: string): string {
  const dir = config.skillsDirOverride || join(cwd, ".agents", "skills");
  if (!existsSync(dir)) return "";
  const { skills } = loadSkillsFromDir({ dir, source: "path" });
  return formatSkillsForPrompt(skills);
}

/** The first workspace-root context file's contents, or null when none exists. */
function loadWorkspaceContextFile(cwd: string): string | null {
  for (const name of CONTEXT_CANDIDATES) {
    const path = join(cwd, name);
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return null;
}
