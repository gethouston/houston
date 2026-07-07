import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
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
  provided?: ProvidedContext,
): string {
  const context = loadWorkspaceContextFile(cwd);
  const base = context ? `${systemPrompt}\n\n${context}` : systemPrompt;
  // Workspace + user context section, injected exactly as the pi backend does
  // (session/resource-loader.ts) so both engines see the same slots (HOU-711).
  // `provided` is the gateway's Supabase copy (cloud), else the cwd files (local).
  const section = buildWorkspaceContextSection(cwd, provided);
  return section ? `${base}\n\n${section}` : base;
}

/** The first workspace-root context file's contents, or null when none exists. */
function loadWorkspaceContextFile(cwd: string): string | null {
  for (const name of CONTEXT_CANDIDATES) {
    const path = join(cwd, name);
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return null;
}
